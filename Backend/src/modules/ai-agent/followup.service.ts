import { prisma } from '../../lib/prisma'
import { processAiResponse } from './ai.service'
import { sendOutboundPlatformMessage } from '../messaging/message.service'
import { getBusinessHours, isOutsideBusinessHours } from '../bot/businessHours.service'

/** Called after the bot sends an outbound message. Schedules the next follow-up in the sequence. */
export async function scheduleNextFollowUp(workspaceId: string, conversationId: string, botAgentId: string) {
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

  const scheduledAt = new Date(Date.now() + nextRule.delayHours * 3600_000)
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
      // business-hours guardrail: never ping a contact outside the workspace's hours
      const bh = await getBusinessHours(job.workspaceId)
      if (bh && isOutsideBusinessHours(bh)) {
        await prisma.followUpJob.updateMany({
          where: { id: job.id },
          data: { status: 'PENDING', sentAt: null, scheduledAt: new Date(Date.now() + 2 * 3600_000) }
        })
        continue
      }

      const conv = await prisma.conversation.findUnique({
        where: { id: job.conversationId },
        include: { channel: true }
      })
      if (!conv || conv.status !== 'OPEN' || !conv.isHandledByBot) continue

      const followUpInstruction =
        'SISTEMA: El cliente no ha respondido. Escribe UN mensaje breve y natural de seguimiento para retomar la conversación según el contexto e intentar avanzar al cierre. No repitas saludos completos ni seas invasivo.'

      const text = await processAiResponse(job.workspaceId, job.conversationId, followUpInstruction)
      if (!text) continue

      await sendOutboundPlatformMessage(job.workspaceId, job.conversationId, text, 'BOT')

      if (conv.assignedToBotId) {
        await scheduleNextFollowUp(job.workspaceId, job.conversationId, conv.assignedToBotId)
      }
    } catch (err) {
      console.error(`[FollowUp] Failed job ${job.id}:`, err)
    }
  }
}
