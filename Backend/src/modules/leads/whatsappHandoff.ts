import { prisma } from '../../lib/prisma'
import { getIO } from '../../lib/socket'
import { sendOutboundPlatformMessage } from '../messaging/message.service'
import { sendWhatsAppTemplateMessage } from '../messaging/channels/whatsapp.service'

/**
 * Starts a WhatsApp conversation for a newly-qualified lead: creates the
 * Conversation if one doesn't already exist, and — when the channel has the
 * AI closing agent enabled — sends the opening message immediately and hands
 * the conversation to the bot (isHandledByBot: true), so the same agent that
 * handles inbound WhatsApp leads (qualification, objection handling,
 * schedule_appointment tool) takes the lead from the first message through
 * booking the visita técnica. If the send fails (channel disconnected) or
 * the channel has no AI agent configured, it falls back to leaving the
 * suggested opener as an internal note for a human to send manually — the
 * lead is never silently dropped.
 *
 * externalId is built ONLY from the lead's own formatted phone number
 * (contact.phone, already validated by normalizePhone) — this is a fresh
 * outbound-initiated contact with no prior WhatsApp message, so there is no
 * lid involved anywhere in this path.
 *
 * The "@c.us" suffix is a whatsapp-web.js (native session) chat-id
 * convention — Cloud API's inbound webhook identifies the sender by bare
 * digits (`msg.from`, see whatsapp.service.ts). Suffixing it unconditionally
 * used to make every Cloud API lead get a conversation row that the
 * customer's real first reply could never match by externalId, silently
 * spawning a second, duplicate conversation the moment they answered.
 */
export async function prepareWhatsappConversation(
  workspaceId: string,
  channel: { id: string; config: unknown },
  contact: { id: string; name: string; phone: string | null },
  openingMessageTemplate: string | null
): Promise<void> {
  if (!contact.phone) return
  const channelId = channel.id
  const isNative = !!(channel.config as any)?.isNative
  const externalId = isNative ? `${contact.phone}@c.us` : contact.phone

  const existing = await prisma.conversation.findUnique({
    where: { workspaceId_channelId_externalId: { workspaceId, channelId, externalId } }
  })
  if (existing) return

  const openingMessage = (openingMessageTemplate?.trim() || 'Hola {nombre}, vimos tu interés y nos encantaría ayudarte 🙌')
    .replace(/\{nombre\}/gi, contact.name)

  const isAiEnabled = !!(channel.config as any)?.isAiEnabled

  const conversation = await prisma.conversation.create({
    data: {
      workspaceId,
      channelId,
      contactId: contact.id,
      externalId,
      status: isAiEnabled ? 'OPEN' : 'PENDING',
      isHandledByBot: isAiEnabled
    }
  })

  getIO().to(`workspace:${workspaceId}`).emit('conversation:new', {
    id: conversation.id,
    channelId,
    externalId,
    status: conversation.status,
    contact: { id: contact.id, name: contact.name },
    createdAt: conversation.createdAt
  })

  if (isAiEnabled) {
    try {
      const config = channel.config as Record<string, any>
      const isCloudApi = !config?.isNative
      if (isCloudApi && config?.openingTemplateId) {
        await sendOpeningTemplate(workspaceId, conversation.id, channelId, config, { name: contact.name, phone: contact.phone })
      } else {
        await sendOutboundPlatformMessage(workspaceId, conversation.id, openingMessage, 'BOT')
      }
      return
    } catch (err) {
      console.error(`[WhatsappHandoff] Failed to send opening WhatsApp message to contact ${contact.id}, falling back to manual note:`, err)
      await prisma.conversation.update({ where: { id: conversation.id }, data: { status: 'PENDING', isHandledByBot: false } })
    }
  }

  const note = await prisma.message.create({
    data: {
      workspaceId,
      conversationId: conversation.id,
      direction: 'OUTBOUND',
      senderType: 'SYSTEM',
      content: `💡 Sugerencia de primer mensaje (lead importado — revisa y envía manualmente):\n\n${openingMessage}`,
      isInternal: true
    }
  })

  getIO().to(`workspace:${workspaceId}`).emit('message:new', {
    id: note.id,
    conversationId: conversation.id,
    direction: 'OUTBOUND',
    senderType: 'SYSTEM',
    content: note.content,
    isInternal: true,
    sentAt: note.sentAt
  })
}

/**
 * Sends the workspace's configured opening HSM template to a fresh lead.
 * Cloud API rejects free-form text to a contact who has never messaged the
 * business number (error 131047) — a template is the only send type allowed
 * to open that first contact.
 */
async function sendOpeningTemplate(
  workspaceId: string,
  conversationId: string,
  channelId: string,
  config: Record<string, any>,
  contact: { name: string; phone: string }
): Promise<void> {
  const template = await prisma.whatsAppTemplate.findFirst({
    where: { id: config.openingTemplateId, channelId, status: 'APPROVED' }
  })
  if (!template) throw new Error(`Opening template ${config.openingTemplateId} not found or not APPROVED`)

  await sendWhatsAppTemplateMessage(
    config.phoneNumberId,
    config.accessToken,
    contact.phone,
    template.name,
    template.language,
    [contact.name]
  )

  const content = template.bodyText.replace(/\{\{1\}\}/g, contact.name)
  const message = await prisma.message.create({
    data: { workspaceId, conversationId, direction: 'OUTBOUND', senderType: 'BOT', content, status: 'SENT' }
  })
  getIO().to(`workspace:${workspaceId}`).emit('message:new', {
    id: message.id,
    conversationId,
    direction: 'OUTBOUND',
    senderType: 'BOT',
    content,
    sentAt: message.sentAt,
    status: 'SENT'
  })
}
