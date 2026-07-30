import { prisma } from '../../lib/prisma'
import { processAiResponse } from './ai.service'
import { sendOutboundPlatformMessage } from '../messaging/message.service'
import { getBusinessHours, isOutsideBusinessHours } from '../bot/businessHours.service'

/** Called after the bot sends an outbound message. Schedules the next follow-up in the sequence. */
export async function scheduleNextFollowUp(workspaceId: string, conversationId: string, botAgentId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { followUpsPaused: true }
  })
  // The lead firmly declined and the bot has no configured objection response for it
  // (see stopFollowUps in ai.service.ts) — stop nudging this conversation for good.
  if (conversation?.followUpsPaused) return

  const rules = await prisma.followUpRule.findMany({
    where: { workspaceId, botAgentId, isActive: true },
    orderBy: { order: 'asc' }
  })
  if (rules.length === 0) return

  const sentCount = await prisma.followUpJob.count({
    where: { conversationId, status: 'SENT' }
  })
  const nextRule = rules[sentCount]
  if (!nextRule) return // sequence exhausted

  // avoid duplicate pending job
  await prisma.followUpJob.updateMany({
    where: { conversationId, status: 'PENDING' },
    data: { status: 'CANCELLED' }
  })

  // Anchor every step's delay to the customer's actual last inbound message,
  // not to "now" (which is really "whenever the previous bot message went
  // out"). Chaining delays off each successive bot send compounds them —
  // a rule meant to land at 23h (deliberately inside Meta's 24h free-text
  // window) would actually fire at 2h+23h=25h, past the window, and get
  // silently rejected. Every step now measures from the same fixed point.
  const lastInbound = await prisma.message.findFirst({
    where: { conversationId, direction: 'INBOUND' },
    orderBy: { sentAt: 'desc' },
    select: { sentAt: true }
  })
  const anchor = lastInbound?.sentAt ?? new Date()
  const scheduledAt = new Date(anchor.getTime() + nextRule.delayHours * 3600_000)

  await prisma.followUpJob.create({
    data: { workspaceId, conversationId, ruleId: nextRule.id, scheduledAt }
  })
}

/** Called on every inbound message: the contact replied, stop the sequence. */
export async function cancelPendingFollowUps(conversationId: string) {
  await prisma.followUpJob.updateMany({
    where: { conversationId, status: 'PENDING' },
    data: { status: 'CANCELLED' }
  })
}

/** Cron worker: send due follow-ups. */
export async function processDueFollowUps() {
  const due = await prisma.followUpJob.findMany({
    where: { status: 'PENDING', scheduledAt: { lte: new Date() } },
    take: 50
  })

  for (const job of due) {
    // claim: conditional update guards against double-send on overlapping cron runs
    const claimed = await prisma.followUpJob.updateMany({
      where: { id: job.id, status: 'PENDING' },
      data: { status: 'SENT', sentAt: new Date() }
    })
    if (claimed.count === 0) continue

    try {
      // business-hours guardrail: never ping a contact outside the workspace's hours.
      // If the check itself fails, requeue (+30min) instead of leaving the job stuck in SENT unsent.
      try {
        const bh = await getBusinessHours(job.workspaceId)
        if (bh && isOutsideBusinessHours(bh)) {
          await prisma.followUpJob.updateMany({
            where: { id: job.id },
            data: { status: 'PENDING', sentAt: null, scheduledAt: new Date(Date.now() + 2 * 3600_000) }
          })
          continue
        }
      } catch (bhErr) {
        console.error(`[FollowUp] Business-hours check failed for job ${job.id}, requeueing +30min:`, bhErr)
        await prisma.followUpJob.updateMany({
          where: { id: job.id },
          data: { status: 'PENDING', sentAt: null, scheduledAt: new Date(Date.now() + 30 * 60_000) }
        })
        continue
      }

      const conv = await prisma.conversation.findUnique({
        where: { id: job.conversationId },
        include: { channel: true }
      })
      if (!conv || conv.status !== 'OPEN' || !conv.isHandledByBot || conv.followUpsPaused) continue

      const rule = await prisma.followUpRule.findUnique({ where: { id: job.ruleId } })

      if (rule?.whatsappTemplateId) {
        // Steps this far out are past Meta's 24h free-text window — must use an
        // approved template (see sendOutboundWhatsAppTemplate in message.service.ts).
        const { sendOutboundWhatsAppTemplate } = await import('../messaging/message.service')
        try {
          await sendOutboundWhatsAppTemplate(job.workspaceId, job.conversationId, rule.whatsappTemplateId)
        } catch (err) {
          console.error(`[FollowUp] Template send failed for job ${job.id}:`, err)
          continue // don't advance the sequence on a failed send
        }
      } else {
        const followUpInstruction =
          'SISTEMA: El cliente no ha respondido. Escribe UN mensaje breve y natural de seguimiento para retomar la conversación según el contexto e intentar avanzar al cierre. No repitas saludos completos ni seas invasivo.'

        const text = await processAiResponse(job.workspaceId, job.conversationId, followUpInstruction)
        if (!text) continue

        await sendOutboundPlatformMessage(job.workspaceId, job.conversationId, text, 'BOT')
      }

      // Same fallback as message.service: if the conversation has no assigned bot,
      // use the workspace's most recent active bot so the sequence continues.
      const botId = conv.assignedToBotId
        ?? (await prisma.botAgent.findFirst({
          where: { workspaceId: job.workspaceId, isActive: true },
          orderBy: { createdAt: 'desc' },
          select: { id: true }
        }))?.id
      if (botId) {
        await scheduleNextFollowUp(job.workspaceId, job.conversationId, botId)
      }
    } catch (err) {
      console.error(`[FollowUp] Failed job ${job.id}:`, err)
    }
  }
}
