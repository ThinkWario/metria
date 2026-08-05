import { randomUUID } from 'crypto'
import { Router } from 'express'
import type { Request, Response } from 'express'
import { simpleRateLimit } from '../../lib/rateLimit'
import { authenticateSolarApiKey } from '../../middleware/solarApiKey'
import { resolveOrCreatePartialContact, finalizeLead, SOLAR_SOURCE } from './leadIngestion.service'
import { prisma } from '../../lib/prisma'

const router = Router()

function getWorkspaceId(): string {
  return process.env.SOLAR_WORKSPACE_ID ?? ''
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
      const result = await finalizeLead(getWorkspaceId(), req.body)
      if (!result.ok) {
        res.status(result.status ?? 400).json({ error: result.error })
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
