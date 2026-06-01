import { prisma } from '../../lib/prisma'
import { processAiResponse } from './ai.service'
import { sendWhatsAppMessage } from '../messaging/channels/whatsapp.service'
import { sendInstagramMessage } from '../messaging/channels/instagram.service'
import { sendTelegramMessage } from '../messaging/channels/telegram.service'

/**
 * AI Nurturing Service
 * Background logic to follow up with cold leads or pending deals.
 */
export async function runAiNurturingCycle() {
  console.log('[AI Nurturing] Starting cycle...')

  // 1. Find conversations with last activity > 24h and still handled by bot
  const yesterday = new Date()
  yesterday.setHours(yesterday.getHours() - 24)

  const idleConversations = await prisma.conversation.findMany({
    where: {
      status: 'OPEN',
      isHandledByBot: true,
      lastMessageAt: { lt: yesterday }
    },
    include: {
      contact: true,
      channel: true
    }
  })

  console.log(`[AI Nurturing] Found ${idleConversations.length} idle conversations.`)

  for (const conv of idleConversations) {
    try {
      const followUpPrompt = `El cliente ha estado inactivo por más de 24 horas. 
      Escribe un mensaje amigable de seguimiento para reactivar el interés, 
      basándote en el historial previo. No seas invasivo.`

      const response = await processAiResponse(conv.workspaceId, conv.id, followUpPrompt)
      
      if (response) {
        const config = conv.channel.config as any
        
        switch (conv.channel.platform) {
          case 'WHATSAPP':
            await sendWhatsAppMessage(config.phoneNumberId, config.accessToken, conv.externalId, response)
            break
          case 'INSTAGRAM':
            await sendInstagramMessage(config.pageAccessToken, conv.externalId, response)
            break
          case 'TELEGRAM':
            await sendTelegramMessage(config.botToken, conv.externalId, response)
            break
        }

        // Log the outbound follow-up
        await prisma.message.create({
          data: {
            workspaceId: conv.workspaceId,
            conversationId: conv.id,
            direction: 'OUTBOUND',
            senderType: 'BOT',
            content: response,
            status: 'SENT'
          }
        })

        await prisma.conversation.update({
          where: { id: conv.id },
          data: { lastMessageAt: new Date() }
        })

        console.log(`[AI Nurturing] Follow-up sent to ${conv.contact?.name || conv.id}`)
      }
    } catch (err) {
      console.error(`[AI Nurturing] Failed for conversation ${conv.id}:`, err)
    }
  }
}
