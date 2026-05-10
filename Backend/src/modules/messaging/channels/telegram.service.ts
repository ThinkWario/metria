import { Telegraf } from 'telegraf'
import type { Update } from 'telegraf/typings/core/types/typegram'
import { processInboundMessage } from '../message.service'

const botCache = new Map<string, Telegraf>()

function getOrCreateBot(workspaceId: string, channelId: string, botToken: string): Telegraf {
  const key = `${workspaceId}:${channelId}`
  if (!botCache.has(key)) {
    const bot = new Telegraf(botToken)

    bot.on('text', async (ctx) => {
      const from = ctx.message.from
      const chat = ctx.message.chat
      await processInboundMessage({
        workspaceId,
        channelId,
        externalConversationId: String(chat.id),
        externalMessageId: String(ctx.message.message_id),
        senderExternalId: String(from.id),
        senderName: [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || String(from.id),
        content: ctx.message.text
      })
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
