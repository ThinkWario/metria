import type { Conversation } from '@/hooks/useInbox'

interface DeepLinkParams {
  conversationId?: string | null
  contactId?: string | null
}

/**
 * Resolves a CRM "open chat" deep link into the conversation it should select.
 * `conversationId` is exact and takes priority; `contactId` picks the contact's
 * most recently active conversation — used by the CRM contacts list, which only
 * knows the contact, not a specific conversation.
 */
export function resolveDeepLinkConversation(
  conversations: Conversation[],
  { conversationId, contactId }: DeepLinkParams
): Conversation | null {
  if (conversationId) {
    return conversations.find(c => c.id === conversationId) ?? null
  }
  if (contactId) {
    const matches = conversations.filter(c => c.contact.id === contactId)
    if (matches.length === 0) return null
    return matches.reduce((latest, current) => {
      const latestTime = latest.lastMessageAt ? new Date(latest.lastMessageAt).getTime() : -1
      const currentTime = current.lastMessageAt ? new Date(current.lastMessageAt).getTime() : -1
      return currentTime > latestTime ? current : latest
    })
  }
  return null
}
