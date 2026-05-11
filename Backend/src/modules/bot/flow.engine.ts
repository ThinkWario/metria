import { prisma } from '../../lib/prisma'
import { sendWhatsAppMessage } from '../messaging/channels/whatsapp.service'
import { sendInstagramMessage } from '../messaging/channels/instagram.service'
import { sendTelegramMessage } from '../messaging/channels/telegram.service'
import { createTicket } from '../crm/ticket.service'
import { updateContact } from '../crm/contact.service'
import { isOutsideBusinessHours } from './businessHours.service'

interface ActionDef {
  type: 'send_message' | 'assign_agent' | 'create_ticket' | 'wait_human' | 'update_stage' | 'send_csat'
  content?: string
  userId?: string
  priority?: string
  status?: string
}

interface ConversationSnap {
  id: string
  workspaceId: string
  channelId: string
  contactId: string | null
  externalId: string
  messageCount: number
  isHandledByBot: boolean
  assignedToUserId: string | null
  channel: { platform: string; config: unknown }
}

export async function tryRunBotFlows(
  workspaceId: string,
  channelId: string,
  conversation: ConversationSnap,
  content?: string
): Promise<void> {
  if (!conversation.isHandledByBot) return

  const flows = await prisma.botFlow.findMany({
    where: { workspaceId, isActive: true },
    include: { botAgent: { select: { isActive: true } } },
    orderBy: { priority: 'asc' }
  })

  for (const flow of flows) {
    if (!flow.botAgent.isActive) continue
    if (flow.channel !== 'ALL' && flow.channel !== conversation.channel.platform) continue
    if (!(await matchesTrigger(flow, conversation, content))) continue
    await executeActions(workspaceId, conversation, flow.actions as unknown as ActionDef[])
    return
  }
}

async function matchesTrigger(
  flow: { triggerType: string; triggerValue: string | null; workspaceId: string },
  conversation: ConversationSnap,
  content?: string
): Promise<boolean> {
  switch (flow.triggerType) {
    case 'FIRST_MESSAGE':
      return conversation.messageCount === 1
    case 'KEYWORD':
      if (!flow.triggerValue || !content) return false
      return content.toLowerCase().includes(flow.triggerValue.toLowerCase())
    case 'BUSINESS_HRS': {
      const bh = await prisma.businessHours.findUnique({ where: { workspaceId: flow.workspaceId } })
      if (!bh) return false
      return isOutsideBusinessHours(bh)
    }
    default:
      return false
  }
}

async function resolveVariables(conversation: ConversationSnap): Promise<Record<string, string>> {
  const contact = conversation.contactId
    ? await prisma.contact.findUnique({ where: { id: conversation.contactId }, select: { name: true } })
    : null
  const assignedUser = conversation.assignedToUserId
    ? await prisma.user.findUnique({ where: { id: conversation.assignedToUserId }, select: { name: true } })
    : null
  return {
    '{nombre}': contact?.name ?? 'Cliente',
    '{agente_nombre}': assignedUser?.name ?? 'nuestro equipo'
  }
}

function interpolate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce((t, [k, v]) => t.replaceAll(k, v), template)
}

async function sendBotMessage(
  workspaceId: string,
  conversation: ConversationSnap,
  text: string
): Promise<void> {
  const config = conversation.channel.config as Record<string, string>
  switch (conversation.channel.platform) {
    case 'WHATSAPP':
      await sendWhatsAppMessage(config.phoneNumberId, config.accessToken, conversation.externalId, text)
      break
    case 'INSTAGRAM':
      await sendInstagramMessage(config.pageAccessToken, conversation.externalId, text)
      break
    case 'TELEGRAM':
      await sendTelegramMessage(config.botToken, conversation.externalId, text)
      break
  }
  await prisma.message.create({
    data: {
      workspaceId,
      conversationId: conversation.id,
      direction: 'OUTBOUND',
      senderType: 'BOT',
      content: text
    }
  })
}

async function executeActions(
  workspaceId: string,
  conversation: ConversationSnap,
  actions: ActionDef[]
): Promise<void> {
  const vars = await resolveVariables(conversation)

  for (const action of actions) {
    switch (action.type) {
      case 'send_message': {
        if (!action.content) break
        await sendBotMessage(workspaceId, conversation, interpolate(action.content, vars))
        break
      }
      case 'assign_agent': {
        if (!action.userId) break
        await prisma.conversation.update({
          where: { id: conversation.id, workspaceId },
          data: { assignedToUserId: action.userId }
        })
        break
      }
      case 'create_ticket': {
        if (!conversation.contactId) break
        await createTicket(workspaceId, {
          contactId: conversation.contactId,
          title: 'Ticket creado por bot',
          priority: action.priority ?? 'MEDIUM',
          conversationId: conversation.id
        })
        break
      }
      case 'wait_human': {
        await prisma.conversation.update({
          where: { id: conversation.id, workspaceId },
          data: { isHandledByBot: false }
        })
        break
      }
      case 'update_stage': {
        if (!conversation.contactId || !action.status) break
        await updateContact(workspaceId, conversation.contactId, { status: action.status })
        break
      }
      case 'send_csat': {
        await sendBotMessage(workspaceId, conversation, '¿Cómo calificarías nuestra atención? Responde del 1 al 5.')
        break
      }
    }
  }
}
