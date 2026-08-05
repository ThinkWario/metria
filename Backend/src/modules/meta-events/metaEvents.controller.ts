import { Request, Response } from 'express'
import { prisma } from '../../lib/prisma'
import { AuthRequest } from '../../middleware/auth'

// MEDICION_PIXEL_CAPI_PARA_DESARROLLADOR.md §14 "Tablero de control" — funnel
// stage order. TechnicalReviewCompleted/FinalProposalSent map to the spec's
// "visita"/"propuesta" labels (no separate event name exists for those).
const FUNNEL_STAGES: Array<{ eventName: string; label: string }> = [
  { eventName: 'Contact', label: 'Contact' },
  { eventName: 'QualifiedLead', label: 'QualifiedLead' },
  { eventName: 'Schedule', label: 'Schedule' },
  { eventName: 'TechnicalReviewCompleted', label: 'Visita' },
  { eventName: 'FinalProposalSent', label: 'Propuesta' },
  { eventName: 'Purchase', label: 'Purchase' }
]

/**
 * "Dashboard diario" from the spec (§14 Tablero de control): CRM-side event
 * counts, CAPI sent/failed, duplicates blocked, funnel de conversión,
 * cobertura de atribución, motivos de pérdida, tiempo hasta primera
 * respuesta IA y las alertas explícitas del spec (cola >5min, error CAPI
 * >1%, events_received != 1, contactos sin session_id/consentimiento). La
 * comparación porcentual Metria vs Meta por evento queda fuera — requiere
 * llamar a la Meta Insights API con permisos que hoy no están confirmados;
 * se documenta como pendiente en vez de simularse.
 */
export async function getMetaEventsSummaryHandler(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = (req as AuthRequest).user!.workspaceId as string
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const rows = await prisma.conversionEvent.findMany({
      where: { workspaceId, createdAt: { gte: since } },
      select: { eventName: true, status: true, duplicateAttempts: true, metaEventsReceived: true }
    })

    const byEvent: Record<string, { sent: number; failed: number; pending: number; duplicatesBlocked: number }> = {}
    for (const row of rows) {
      byEvent[row.eventName] ??= { sent: 0, failed: 0, pending: 0, duplicatesBlocked: 0 }
      if (row.status === 'sent') byEvent[row.eventName].sent++
      else if (row.status === 'failed') byEvent[row.eventName].failed++
      else byEvent[row.eventName].pending++
      byEvent[row.eventName].duplicatesBlocked += row.duplicateAttempts
    }

    const sentCount = rows.filter(r => r.status === 'sent').length
    const failedCount = rows.filter(r => r.status === 'failed').length
    const attempted = sentCount + failedCount
    const errorRatePct = attempted > 0 ? Math.round((failedCount / attempted) * 1000) / 10 : 0
    const eventsReceivedMismatchCount = rows.filter(r => r.status === 'sent' && r.metaEventsReceived !== 1).length

    const oldestUnresolved = await prisma.conversionEvent.findFirst({
      where: { workspaceId, status: { in: ['pending', 'retry'] } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true }
    })
    const oldestPendingAgeSeconds = oldestUnresolved
      ? Math.floor((Date.now() - oldestUnresolved.createdAt.getTime()) / 1000)
      : 0

    // Funnel — distinct contacts reaching each hito (lifetime, not windowed;
    // a funnel counted only over 24h would be near-empty for later stages).
    const sentEvents = await prisma.conversionEvent.findMany({
      where: { workspaceId, status: 'sent', eventName: { in: FUNNEL_STAGES.map(s => s.eventName) } },
      select: { eventName: true, leadId: true }
    })
    const contactsByStage: Record<string, Set<string>> = {}
    for (const ev of sentEvents) {
      contactsByStage[ev.eventName] ??= new Set()
      contactsByStage[ev.eventName].add(ev.leadId)
    }
    const funnel = FUNNEL_STAGES.map(stage => ({
      eventName: stage.eventName,
      label: stage.label,
      contactCount: contactsByStage[stage.eventName]?.size ?? 0
    }))

    // Atribución — cobertura de fbc/fbp y UTM entre los contactos creados en
    // la ventana de 24h.
    const [contactsInWindow, contactsWithFbcFbp, contactsWithUtm, contactsMissingConsent] = await Promise.all([
      prisma.contact.count({ where: { workspaceId, createdAt: { gte: since } } }),
      prisma.contact.count({ where: { workspaceId, createdAt: { gte: since }, OR: [{ fbc: { not: null } }, { fbp: { not: null } }] } }),
      prisma.contact.count({ where: { workspaceId, createdAt: { gte: since }, utmSource: { not: null } } }),
      prisma.contact.count({ where: { workspaceId, createdAt: { gte: since }, OR: [{ sessionId: null }, { consentStatus: { not: 'granted' } }] } })
    ])
    const pct = (n: number, total: number): number => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0)

    // Motivos de pérdida — sólo dentro de Metria (últimos 30 días).
    const lostDeals = await prisma.deal.groupBy({
      by: ['lostReason'],
      where: { workspaceId, status: 'LOST', lostAt: { gte: since30d } },
      _count: { _all: true }
    })
    const lostReasons = lostDeals
      .map(g => ({ reason: g.lostReason ?? 'Sin motivo registrado', count: g._count._all }))
      .sort((a, b) => b.count - a.count)

    // Tiempo hasta primera respuesta IA — primer mensaje CONTACT vs primer
    // BOT posterior, por conversación iniciada en la ventana. No requiere
    // instrumentación nueva: Message.senderType ya distingue CONTACT/BOT.
    const conversationsInWindow = await prisma.conversation.findMany({
      where: { workspaceId, createdAt: { gte: since } },
      select: { id: true }
    })
    const conversationIds = conversationsInWindow.map(c => c.id)
    const responseSeconds: number[] = []
    if (conversationIds.length > 0) {
      const msgs = await prisma.message.findMany({
        where: { workspaceId, conversationId: { in: conversationIds }, senderType: { in: ['CONTACT', 'BOT'] } },
        orderBy: { sentAt: 'asc' },
        select: { conversationId: true, senderType: true, sentAt: true }
      })
      const firstContactAt: Record<string, Date> = {}
      for (const msg of msgs) {
        if (msg.senderType === 'CONTACT' && !firstContactAt[msg.conversationId]) {
          firstContactAt[msg.conversationId] = msg.sentAt
        } else if (msg.senderType === 'BOT' && firstContactAt[msg.conversationId]) {
          const t0 = firstContactAt[msg.conversationId]
          responseSeconds.push(Math.floor((msg.sentAt.getTime() - t0.getTime()) / 1000))
          delete firstContactAt[msg.conversationId]
        }
      }
    }
    const avgFirstResponseSeconds = responseSeconds.length > 0
      ? Math.round(responseSeconds.reduce((sum, s) => sum + s, 0) / responseSeconds.length)
      : null

    const queueBacklogAlert = oldestPendingAgeSeconds > 300
    const errorRateAlert = errorRatePct > 1
    const eventsReceivedMismatchAlert = eventsReceivedMismatchCount > 0
    const missingConsentAlert = contactsMissingConsent > 0

    res.json({
      windowHours: 24,
      byEvent,
      totals: {
        sent: sentCount,
        failed: failedCount,
        pending: rows.filter(r => r.status !== 'sent' && r.status !== 'failed').length,
        duplicatesBlocked: rows.reduce((sum, r) => sum + r.duplicateAttempts, 0)
      },
      errorRatePct,
      eventsReceivedMismatchCount,
      oldestPendingAgeSeconds,
      funnel,
      attribution: {
        contactsInWindow,
        fbcOrFbpCoveragePct: pct(contactsWithFbcFbp, contactsInWindow),
        utmCoveragePct: pct(contactsWithUtm, contactsInWindow)
      },
      lostReasons,
      avgFirstResponseSeconds,
      alerts: {
        queueBacklog: queueBacklogAlert,
        errorRateOver1pct: errorRateAlert,
        eventsReceivedMismatch: eventsReceivedMismatchAlert,
        contactsMissingConsentOrSession: missingConsentAlert
      },
      contactsMissingConsent,
      queueBacklogAlert,
      note: 'Comparación Metria vs Meta por evento: pendiente (requiere Meta Insights API / permisos adicionales del access token).'
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
