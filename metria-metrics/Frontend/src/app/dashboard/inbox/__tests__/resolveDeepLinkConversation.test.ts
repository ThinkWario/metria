import { describe, it, expect } from 'vitest'
import { resolveDeepLinkConversation } from '../resolveDeepLinkConversation'
import type { Conversation } from '@/hooks/useInbox'

const baseContact = { id: 'contact-1', name: 'Test Contact', phone: '+56900000000', status: 'LEAD', ltv: 0, source: 'WHATSAPP_DIRECT' }

function makeConversation(overrides: Partial<Conversation> & { contactId?: string } = {}): Conversation {
  const { contactId, ...rest } = overrides
  return {
    id: 'conv-1',
    status: 'OPEN',
    messageCount: 1,
    lastMessageAt: undefined,
    isHandledByBot: true,
    contact: { ...baseContact, id: contactId ?? baseContact.id },
    channel: { id: 'ch-1', platform: 'WHATSAPP', name: 'WhatsApp' },
    createdAt: '2026-01-01T00:00:00.000Z',
    ...rest
  }
}

describe('resolveDeepLinkConversation', () => {
  it('returns the exact conversation when conversationId matches', () => {
    const target = makeConversation({ id: 'conv-2' })
    const conversations = [makeConversation({ id: 'conv-1' }), target]

    expect(resolveDeepLinkConversation(conversations, { conversationId: 'conv-2' })).toBe(target)
  })

  it('returns null when conversationId has no match', () => {
    const conversations = [makeConversation({ id: 'conv-1' })]
    expect(resolveDeepLinkConversation(conversations, { conversationId: 'missing' })).toBeNull()
  })

  it('returns the only conversation for a contact when contactId matches one', () => {
    const target = makeConversation({ id: 'conv-1', contactId: 'contact-9' })
    const conversations = [target, makeConversation({ id: 'conv-2', contactId: 'contact-other' })]

    expect(resolveDeepLinkConversation(conversations, { contactId: 'contact-9' })).toBe(target)
  })

  it('returns the most recently active conversation when a contact has several', () => {
    const older = makeConversation({ id: 'conv-old', contactId: 'contact-9', lastMessageAt: '2026-01-01T00:00:00.000Z' })
    const newer = makeConversation({ id: 'conv-new', contactId: 'contact-9', lastMessageAt: '2026-02-01T00:00:00.000Z' })

    expect(resolveDeepLinkConversation([older, newer], { contactId: 'contact-9' })).toBe(newer)
  })

  it('treats a missing lastMessageAt as older than any dated conversation', () => {
    const undated = makeConversation({ id: 'conv-undated', contactId: 'contact-9', lastMessageAt: undefined })
    const dated = makeConversation({ id: 'conv-dated', contactId: 'contact-9', lastMessageAt: '2026-01-01T00:00:00.000Z' })

    expect(resolveDeepLinkConversation([undated, dated], { contactId: 'contact-9' })).toBe(dated)
  })

  it('returns null when the contact has no conversations', () => {
    const conversations = [makeConversation({ contactId: 'contact-other' })]
    expect(resolveDeepLinkConversation(conversations, { contactId: 'contact-9' })).toBeNull()
  })

  it('returns null when neither param is provided', () => {
    expect(resolveDeepLinkConversation([makeConversation()], {})).toBeNull()
  })

  it('conversationId takes priority when both params are provided', () => {
    const target = makeConversation({ id: 'conv-2', contactId: 'contact-9' })
    const conversations = [makeConversation({ id: 'conv-1', contactId: 'contact-1' }), target]

    expect(resolveDeepLinkConversation(conversations, { conversationId: 'conv-2', contactId: 'contact-1' })).toBe(target)
  })
})
