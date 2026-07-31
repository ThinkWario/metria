import { Request, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { AuthRequest } from '../../middleware/auth'

/**
 * "Dashboard diario" from the spec: CRM-side event counts, CAPI sent/failed,
 * duplicates blocked, and the age of the oldest unresolved event (used to
 * alert when the retry queue backs up past 5 minutes).
 */
export async function getMetaEventsSummaryHandler(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = (req as AuthRequest).user!.workspaceId as string
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const rows = await prisma.conversionEvent.findMany({
      where: { workspaceId, createdAt: { gte: since } },
      select: { eventName: true, status: true, duplicateAttempts: true }
    })

    const byEvent: Record<string, { sent: number; failed: number; pending: number; duplicatesBlocked: number }> = {}
    for (const row of rows) {
      byEvent[row.eventName] ??= { sent: 0, failed: 0, pending: 0, duplicatesBlocked: 0 }
      if (row.status === 'sent') byEvent[row.eventName].sent++
      else if (row.status === 'failed') byEvent[row.eventName].failed++
      else byEvent[row.eventName].pending++
      byEvent[row.eventName].duplicatesBlocked += row.duplicateAttempts
    }

    const oldestUnresolved = await prisma.conversionEvent.findFirst({
      where: { workspaceId, status: { in: ['pending', 'retry'] } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true }
    })
    const oldestPendingAgeSeconds = oldestUnresolved
      ? Math.floor((Date.now() - oldestUnresolved.createdAt.getTime()) / 1000)
      : 0

    res.json({
      windowHours: 24,
      byEvent,
      totals: {
        sent: rows.filter(r => r.status === 'sent').length,
        failed: rows.filter(r => r.status === 'failed').length,
        pending: rows.filter(r => r.status !== 'sent' && r.status !== 'failed').length,
        duplicatesBlocked: rows.reduce((sum, r) => sum + r.duplicateAttempts, 0)
      },
      oldestPendingAgeSeconds,
      queueBacklogAlert: oldestPendingAgeSeconds > 300,
      note: 'CAPI-side only — client-side Pixel coverage is tracked in the onboarding/solar apps, not here.'
    })
  } catch (err) {
    console.error('[MetaEvents] summary error:', err)
    res.status(500).json({ error: 'Failed to load meta events summary' })
  }
}

/**
 * Per-send detail (bobyads 31jul, "Metria": mostrar estado y respuesta de
 * cada envío CAPI) — the summary above only aggregates counts; this exposes
 * the individual ConversionEvent rows (status, Meta's HTTP status,
 * fbtrace_id, error) already recorded by sendAndRecord().
 */
export async function getMetaEventsRecentHandler(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = (req as AuthRequest).user!.workspaceId as string
    const limit = Math.min(Number(req.query.limit) || 50, 200)

    const rows = await prisma.conversionEvent.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true, eventName: true, eventId: true, status: true,
        metaHttpStatus: true, metaEventsReceived: true, metaFbtraceId: true,
        lastErrorCode: true, attemptCount: true, createdAt: true, sentAt: true
      }
    })

    res.json({ events: rows })
  } catch (err) {
    console.error('[MetaEvents] recent error:', err)
    res.status(500).json({ error: 'Failed to load recent meta events' })
  }
}
