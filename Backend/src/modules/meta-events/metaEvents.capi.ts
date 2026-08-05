/**
 * Generic Meta Conversions API sender — implements the dc_events_v1 spec's
 * idempotency and audit rules. Every business-lifecycle event (Contact,
 * Lead, QualifiedLead, Schedule, TechnicalReviewCompleted, Purchase, ...)
 * flows through here so event_id format, consent gating, and the
 * conversion_events audit trail stay in one place instead of being
 * reimplemented per call site.
 */

import crypto from 'crypto'
import { prisma } from '../../lib/prisma'

const CAPI_API_VERSION = 'v19.0'
const MAX_ATTEMPTS = 5

// QA_E2E_DIRECTO_METRIA_04AGO2026.md §5.3: 'SubmitApplication' (nombre
// histórico) removido del tipo — 'FinanceApplicationSubmitted' es el único
// evento canónico de pre-calificación, ya no tenía ningún emisor real.
export type MetaEventName =
  | 'Contact' | 'Lead' | 'FinanceApplicationSubmitted' | 'QualifiedLead'
  | 'Schedule' | 'TechnicalReviewCompleted' | 'FinalProposalSent' | 'Purchase'

export type ActionSource = 'website' | 'chat' | 'phone_call' | 'system_generated'

// custom_data allowlist — the spec explicitly forbids RUT, address, income,
// credit score, etc. Only pre-approved non-identifying keys ever leave this
// function; nothing gets spread in wholesale from a caller-supplied object.
const ALLOWED_CUSTOM_DATA_KEYS = new Set([
  'content_name', 'content_category', 'lead_type', 'qualification_version',
  'score_band', 'bill_band', 'service_area_match', 'value', 'currency'
])

function hashPii(value: string): string {
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex')
}

export function buildEventId(subjectId: string, eventName: string, suffix?: string): string {
  return suffix ? `dc:v2:${subjectId}:${eventName}:${suffix}` : `dc:v2:${subjectId}:${eventName}`
}

function computeNextRetry(attempt: number): Date {
  const backoffMs = Math.min(2 ** attempt * 60_000, 30 * 60_000) // cap at 30 min
  return new Date(Date.now() + backoffMs)
}

interface EmitParams {
  workspaceId: string
  leadId: string
  eventName: MetaEventName
  actionSource: ActionSource
  occurredAt: Date
  eventIdSuffix?: string
  // Overrides leadId as the event_id subject — used for Contact/Lead, whose
  // spec'd id is dc:v2:<session_id>:<eventName> so a future browser-side
  // Pixel/CAPI using the same session_id can dedupe with this one. leadId
  // is still used for the Contact FK and consent lookup regardless.
  eventIdSubject?: string
  // URL de origen del hito (sin PII) — INSTRUCCIONES_DESARROLLADOR_TRACKING_METRIA_SOLAR_AGOSTO_2026.md
  // §12 lo exige para Contact/Lead/FinanceApplicationSubmitted, que ocurren
  // en solar.drillchile.cl. Opcional porque eventos backend-originados
  // (Schedule, TechnicalReviewCompleted, Purchase, QualifiedLead) no tienen
  // una URL de página que los origine.
  eventSourceUrl?: string | null
  contact: {
    email?: string | null
    phone?: string | null
    fbc?: string | null
    fbp?: string | null
    clientIpAddress?: string | null
    clientUserAgent?: string | null
  }
  customData?: Record<string, string | number | boolean>
}

/**
 * Builds the CAPI payload, persists a ConversionEvent row (status=pending)
 * BEFORE sending — per the spec's "persistir event_id antes de enviar" rule
 * — then sends. Skips silently (no throw) if Meta isn't configured for this
 * workspace, or if the contact has no recorded consent (acceptance test #3:
 * "sin consentimiento: no se envía a Meta").
 */
export async function emitConversionEvent(params: EmitParams): Promise<void> {
  const { workspaceId, leadId, eventName, actionSource, occurredAt, contact, eventSourceUrl } = params

  const freshContact = await prisma.contact.findUnique({
    where: { id: leadId },
    select: { consentStatus: true, consentVersion: true, consentAt: true }
  })
  if (freshContact?.consentStatus !== 'granted' || !freshContact.consentVersion || !freshContact.consentAt) {
    console.warn(`[MetaEvents] Skipped ${eventName} for lead ${leadId}: consentStatus/consentVersion/consentAt incompletos`)
    return
  }

  const integration = await prisma.integration.findUnique({
    where: { workspaceId_platform: { workspaceId, platform: 'meta' } }
  })
  const config = (integration?.config ?? {}) as { accessToken?: string; pixelId?: string }
  if (!config.pixelId || !config.accessToken) return

  const eventId = buildEventId(params.eventIdSubject ?? leadId, eventName, params.eventIdSuffix)

  const userData: Record<string, unknown> = { external_id: [hashPii(leadId)] }
  if (contact.email) userData.em = [hashPii(contact.email)]
  if (contact.phone) userData.ph = [hashPii(contact.phone)]
  if (contact.fbc) userData.fbc = contact.fbc
  if (contact.fbp) userData.fbp = contact.fbp
  if (contact.clientIpAddress) userData.client_ip_address = contact.clientIpAddress
  if (contact.clientUserAgent) userData.client_user_agent = contact.clientUserAgent

  const customData: Record<string, unknown> = { event_schema_version: 'dc_events_v2_metria' }
  for (const [key, value] of Object.entries(params.customData ?? {})) {
    if (ALLOWED_CUSTOM_DATA_KEYS.has(key)) customData[key] = value
  }

  const payload = {
    data: [{
      event_name: eventName,
      event_time: Math.floor(occurredAt.getTime() / 1000),
      event_id: eventId,
      action_source: actionSource,
      ...(eventSourceUrl && { event_source_url: eventSourceUrl }),
      user_data: userData,
      custom_data: customData
    }]
  }
  const serializedPayload = JSON.stringify(payload)
  const payloadHash = crypto.createHash('sha256').update(serializedPayload).digest('hex')

  let rowId: string
  try {
    const row = await prisma.conversionEvent.create({
      data: {
        workspaceId, leadId, pixelId: config.pixelId, eventName, eventId,
        actionSource, occurredAt, payloadHash, payload: JSON.parse(serializedPayload), status: 'pending'
      }
    })
    rowId = row.id
  } catch (err: any) {
    // Unique(pixelId, eventName, eventId) — this exact milestone was already
    // recorded. Never re-create a second UUID for the same hito.
    if (err?.code === 'P2002') {
      console.log(`[MetaEvents] ${eventName} for lead ${leadId} already recorded (${eventId}) — skipping duplicate`)
      await prisma.conversionEvent.updateMany({
        where: { pixelId: config.pixelId, eventName, eventId },
        data: { duplicateAttempts: { increment: 1 } }
      })
      return
    }
    throw err
  }

  await sendAndRecord(rowId, config.pixelId, config.accessToken, payload)
}

/**
 * A failed send after MAX_ATTEMPTS is not "still retrying" — the cron's
 * `attemptCount: { lt: MAX_ATTEMPTS }` filter already excludes it from the
 * sweep, but leaving status='retry' forever makes it invisible as anything
 * other than "in progress" (QA_E2E_POST_FIXES_05AGO2026.md §7 P1: the
 * expected state model is "pending/sent/failed/dead_letter", not an
 * unbounded retry that silently stalls). `dead_letter` is a free-text
 * value, not a Prisma enum, so this needed no migration.
 */
function statusAfterFailure(attemptCountAfterThisTry: number): string {
  return attemptCountAfterThisTry >= MAX_ATTEMPTS ? 'dead_letter' : 'retry'
}

/** Shared by the initial send and the retry sweep so both hit Meta identically. */
export async function sendAndRecord(
  rowId: string,
  pixelId: string,
  accessToken: string,
  payload: unknown
): Promise<void> {
  const current = await prisma.conversionEvent.findUnique({ where: { id: rowId }, select: { attemptCount: true } })
  const attemptCountAfterThisTry = (current?.attemptCount ?? 0) + 1

  try {
    const res = await fetch(`https://graph.facebook.com/${CAPI_API_VERSION}/${pixelId}/events`, {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload as object)
    })
    const body = await res.json().catch(() => ({} as Record<string, unknown>))
    const fbtraceId = (body as any)?.fbtrace_id as string | undefined
    const eventsReceived = (body as any)?.events_received as number | undefined
    const status = res.ok ? 'sent' : statusAfterFailure(attemptCountAfterThisTry)

    await prisma.conversionEvent.update({
      where: { id: rowId },
      data: {
        status,
        metaHttpStatus: res.status,
        metaEventsReceived: eventsReceived ?? null,
        metaFbtraceId: fbtraceId ?? null,
        attemptCount: { increment: 1 },
        sentAt: res.ok ? new Date() : null,
        lastErrorCode: res.ok ? null : ((body as any)?.error?.type ?? String(res.status)),
        nextRetryAt: status === 'retry' ? computeNextRetry(1) : null
      }
    })
    if (!res.ok) {
      console.error(`[MetaEvents] send failed for event ${rowId} (status=${status}): ${res.status} ${JSON.stringify(body)}`)
    }
  } catch (err) {
    const status = statusAfterFailure(attemptCountAfterThisTry)
    await prisma.conversionEvent.update({
      where: { id: rowId },
      data: {
        status,
        attemptCount: { increment: 1 },
        lastErrorCode: 'network_error',
        nextRetryAt: status === 'retry' ? computeNextRetry(1) : null
      }
    })
    console.error(`[MetaEvents] send error for event ${rowId} (status=${status}):`, err)
  }
}

export { MAX_ATTEMPTS }
