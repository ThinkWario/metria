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
    console.error('[SolarLead] Error en POST:', err)
    res.status(500).json({ error: 'Error interno' })
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
    console.error('[SolarLead] Error en GET:', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

export default router
