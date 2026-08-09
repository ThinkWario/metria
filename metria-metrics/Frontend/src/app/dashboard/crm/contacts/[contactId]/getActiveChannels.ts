export interface ContactConversationSummary {
  id: string
  status: string
  messageCount: number
  lastMessageAt: string | null
  channel: { platform: string; name: string }
}

/**
 * One entry per distinct channel platform the contact has ever talked through,
 * pointing at that platform's most recently active conversation. Presence here
 * means "has a conversation record" — independent of messageCount, so a
 * WhatsApp template sent with no reply yet still counts as active.
 */
export function getActiveChannels(conversations: ContactConversationSummary[]): { platform: string; conversationId: string }[] {
  const byPlatform = new Map<string, { conversationId: string; lastMessageAt: string | null }>()
  for (const conv of conversations) {
    const platform = conv.channel.platform
    const existing = byPlatform.get(platform)
    const existingTime = existing?.lastMessageAt ? new Date(existing.lastMessageAt).getTime() : -1
    const convTime = conv.lastMessageAt ? new Date(conv.lastMessageAt).getTime() : -1
    if (!existing || convTime > existingTime) {
      byPlatform.set(platform, { conversationId: conv.id, lastMessageAt: conv.lastMessageAt })
    }
  }
  return [...byPlatform.entries()].map(([platform, v]) => ({ platform, conversationId: v.conversationId }))
}
