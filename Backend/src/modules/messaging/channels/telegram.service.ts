import { Telegraf } from 'telegraf'
import type { Update } from 'telegraf/typings/core/types/typegram'
import { processInboundMessage } from '../message.service'

const BOT_CACHE_MAX = 200
const botCache = new Map<string, Telegraf>()

function getOrCreateBot(workspaceId: string, channelId: string, botToken: string): Telegraf {
  const key = `${workspaceId}:${channelId}`
  if (!botCache.has(key)) {
    if (botCache.size >= BOT_CACHE_MAX) {
      const oldestKey = botCache.keys().next().value
      if (oldestKey) botCache.delete(oldestKey)
    }

    const bot = new Telegraf(botToken)

    bot.on('text', async (ctx) => {
      const from = ctx.message.from
      const chat = ctx.message.chat
      await processInboundMessage({
        workspaceId,
        channelId,
        externalConversationId: String(chat.id),
        externalMessageId: String(ctx.message.message_id),
        // prefix distinguishes Telegram IDs from real phone numbers
        senderExternalId: `tg_${from.id}`,
        senderName: [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || String(from.id),
        content: ctx.message.text
      })
    })

    bot.catch((err: unknown) => {
      console.error(`[Telegraf:${key}] unhandled error:`, err)
    })

    botCache.set(key, bot)
  }
  return botCache.get(key)!
}

export async function handleTelegramUpdate(
  workspaceId: string,
  channelId: string,
  botToken: string,
  update: Update
): Promise<void> {
  const bot = getOrCreateBot(workspaceId, channelId, botToken)
  await bot.handleUpdate(update)
}

export function clearBotCache(key?: string): void {
  if (key) botCache.delete(key)
  else botCache.clear()
}

/**
 * Send an outbound text message to a Telegram chat via the Bot API.
 * @param botToken  Bot token from BotFather
 * @param chatId    Telegram chat/user ID (stored as contact.phone with tg_ prefix stripped)
 */
export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string
): Promise<void> {
  // Strip optional tg_ prefix so both raw IDs and prefixed IDs work
  const normalizedChatId = chatId.startsWith('tg_') ? chatId.slice(3) : chatId

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: normalizedChatId, text })
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Telegram API error ${response.status}: ${body}`)
  }
}
