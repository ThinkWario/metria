import { randomUUID } from 'crypto'
import { Router } from 'express'
import type { Request, Response } from 'express'
import { simpleRateLimit } from '../../lib/rateLimit'
import { authenticateSolarApiKey } from '../../middleware/solarApiKey'
import { resolveOrCreatePartialContact, finalizeLead, SOLAR_SOURCE, type FinalizeLeadResult } from './leadIngestion.service'
import { prisma } from '../../lib/prisma'
import { redis } from '../../lib/redis'

const router = Router()

function getWorkspaceId(): string {
  return process.env.SOLAR_WORKSPACE_ID ?? ''
}

// Coalesces near-simultaneous `complete` calls for the same sessionId (a
// double-click, a client-side retry-on-timeout) into one real finalizeLead
// run — mitigates the redundant CAPI invocations QA_CORROBORACION_
// DESARROLLADOR_05AGO2026.md §4.3 flagged (+4/+4/+3 dup. vs. the +2/+2/+1
// the two legitimate financing resubmits should have produced).
//
// Two layers:
//   1. In-process: an in-flight Promise map, shared instantly (no I/O) when
//      two requests land on the same Node process.
//   2. Cross-process: a Redis lock (SET NX) + a short-lived cache of the
//      SUCCESS result only — so a second app instance handling the same
//      sessionId within the window reuses the first instance's outcome
//      instead of re-running finalizeLead (and re-attempting CAPI). Only
//      successes are cached: caching a 409/422 would serve a stale error to
//      a user who fixed their data and immediately resubmitted, which is
//      worse than the redundant-invocation problem this exists to reduce.
// Redis is a soft dependency here — any Redis error/timeout just skips
// coalescing for that round and calls finalizeLead directly. The
// ConversionEvent unique index (ok result) and the identity unique
// constraints + P2002 handling (error result) are what actually guarantee
// correctness; this whole module is upstream noise reduction on top of that.
const COMPLETE_COALESCE_WINDOW_MS = 3_000
const COMPLETE_LOCK_TTL_MS = 8_000
const COMPLETE_LOCK_POLL_INTERVAL_MS = 200
const COMPLETE_LOCK_POLL_ATTEMPTS = 10 // ~2s ceiling waiting on another instance
const REDIS_OP_TIMEOUT_MS = 300 // a stalled Redis must never meaningfully delay lead submission

const inFlightCompletions = new Map<string, Promise<FinalizeLeadResult>>()

function completeResultKey(sessionId: string): string {
  return `solar:complete:result:${sessionId}`
}
function completeLockKey(sessionId: string): string {
  return `solar:complete:lock:${sessionId}`
}

async function withRedisTimeout<T>(op: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('redis_timeout')), REDIS_OP_TIMEOUT_MS)
  })
  try {
    return await Promise.race([op, timeout])
  } finally {
    clearTimeout(timer!)
  }
}

async function readCachedSuccess(resultKey: string): Promise<FinalizeLeadResult | null> {
  try {
    const cached = await withRedisTimeout(redis.get(resultKey))
    return cached ? (JSON.parse(cached) as FinalizeLeadResult) : null
  } catch {
    return null
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Test-only escape hatch — inFlightCompletions is module-level state, so
// without this, reusing the same sessionId across test cases in the same
// file would leak a pending/settled promise from one test into the next.
export function __resetCompleteCoalescingForTests(): void {
  inFlightCompletions.clear()
}

async function finalizeLeadAcrossInstances(
  workspaceId: string, payload: Record<string, unknown>, sessionId: string
): Promise<FinalizeLeadResult> {
  const resultKey = completeResultKey(sessionId)
  const lockKey = completeLockKey(sessionId)

  const cached = await readCachedSuccess(resultKey)
  if (cached) return cached

  let holdsLock = true
  try {
    const acquired = await withRedisTimeout(redis.set(lockKey, '1', 'PX', COMPLETE_LOCK_TTL_MS, 'NX'))
    holdsLock = acquired === 'OK'
  } catch {
    // Redis unreachable — can't coordinate with other instances, so this
    // one just runs finalizeLead itself rather than block the request.
    holdsLock = true
  }

  if (!holdsLock) {
    // Another instance already claimed this sessionId — poll for its
    // published success instead of triggering a second CAPI round.
    for (let attempt = 0; attempt < COMPLETE_LOCK_POLL_ATTEMPTS; attempt++) {
      await sleep(COMPLETE_LOCK_POLL_INTERVAL_MS)
      const polled = await readCachedSuccess(resultKey)
      if (polled) return polled
    }
    // Timed out (or the lock holder's attempt failed, so nothing was ever
    // published) — run it ourselves rather than hang the request forever.
  }

  try {
    const result = await finalizeLead(workspaceId, payload as any)
    if (result.ok) {
      try {
        await withRedisTimeout(
          redis.set(resultKey, JSON.stringify({ ok: true }), 'PX', COMPLETE_COALESCE_WINDOW_MS)
        )
      } catch { /* best-effort cache write — must not fail the request */ }
    }
    return result
  } finally {
    if (holdsLock) {
      redis.del(lockKey).catch(() => {}) // self-expires via TTL either way
    }
  }
}

function finalizeLeadCoalesced(
  workspaceId: string, payload: Record<string, unknown>, sessionId: string
): Promise<FinalizeLeadResult> {
  const inFlight = inFlightCompletions.get(sessionId)
  if (inFlight) return inFlight

  const promise = finalizeLeadAcrossInstances(workspaceId, payload, sessionId)
  inFlightCompletions.set(sessionId, promise)
  // .finally()'s return value is a second, distinct promise — if it's left
  // dangling and `promise` rejects, Node reports an *additional* unhandled
  // rejection for it even though the real error is already caught by
  // whoever awaits `promise` directly. Swallow that second one explicitly.
  promise.finally(() => inFlightCompletions.delete(sessionId)).catch(() => {})
  return promise
}

// QA_E2E_POST_FIXES_05AGO2026.md §7 P0: "el backend no puede ocultar la
// causa operacional" — an unhandled exception here used to become a bare
// {error:'Error interno'} with nothing to grep for in Vercel/Metria logs.
// The UI keeps its friendly copy; trace_id is the correlation key between
// what the user saw and the actual stack trace in these logs.
function logAndRespondUnexpectedError(res: Response, context: string, err: unknown): void {
  const traceId = randomUUID()
  console.error(`[SolarLead] ${context} (trace_id=${traceId}):`, err)
  res.status(500).json({ error: 'No pudimos procesar tu solicitud. Intenta de nuevo.', trace_id: traceId })
}

// 30 requests/min por IP — un wizard normal hace unas 10 llamadas de save,
// esto deja margen sin abrir la puerta a abuso del endpoint público.
router.post('/solar/lead', authenticateSolarApiKey, simpleRateLimit(60 * 1000, 30), async (req: Request, res: Response): Promise<void> => {
  try {
    const { action, sessionId } = req.body ?? {}
    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({ error: 'sessionId requerido' })
      return
    }

    if (action === 'save') {
      await resolveOrCreatePartialContact(getWorkspaceId(), req.body)
      res.json({ status: 'success' })
      return
    }

    if (action === 'complete') {
      const result = await finalizeLeadCoalesced(getWorkspaceId(), req.body, sessionId)
      if (!result.ok) {
        res.status(result.status ?? 400).json({ error: result.error, code: result.code })
        return
      }
      res.json({ status: 'success' })
      return
    }

    res.status(400).json({ error: 'action debe ser "save" o "complete"' })
  } catch (err: any) {
    logAndRespondUnexpectedError(res, `Error en POST (action=${req.body?.action}, sessionId=${req.body?.sessionId})`, err)
  }
})

router.get('/solar/lead', authenticateSolarApiKey, simpleRateLimit(60 * 1000, 30), async (req: Request, res: Response): Promise<void> => {
  try {
    const sessionId = String(req.query.sessionId ?? '')
    if (!sessionId) {
      res.status(400).json({ error: 'sessionId requerido' })
      return
    }

    const contact = await prisma.contact.findUnique({
      where: { workspaceId_source_sessionId: { workspaceId: getWorkspaceId(), source: SOLAR_SOURCE, sessionId } }
    })
    if (!contact) {
      res.status(404).json({ error: 'No encontrado' })
      return
    }

    const rawFields = ((contact.qualificationData as any)?.rawFields ?? {}) as Record<string, unknown>
    res.json({ status: 'success', data: rawFields, step: (rawFields.step as number) ?? 1 })
  } catch (err: any) {
    logAndRespondUnexpectedError(res, `Error en GET (sessionId=${req.query?.sessionId})`, err)
  }
})

export default router
