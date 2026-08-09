import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    conversation: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn()
    },
    message: { findMany: vi.fn(), create: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    channel: { findUnique: vi.fn() },
    contact: { findUnique: vi.fn() }
  }
}))

vi.mock('../../../lib/socket', () => ({
  getIO: vi.fn(() => ({ to: vi.fn().mockReturnThis(), emit: vi.fn() }))
}))

// Channel service mocks — registered lazily per platform
vi.mock('../channels/whatsapp.service', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue(undefined)
}))
vi.mock('../channels/telegram.service', () => ({
  sendTelegramMessage: vi.fn().mockResolvedValue(undefined)
}))
const nativeSendMessage = vi.fn().mockResolvedValue('wa-native-1')
vi.mock('../../../lib/whatsapp/WhatsAppManager', () => ({
  WhatsAppSessionManager: { getInstance: () => ({ sendMessage: nativeSendMessage }) }
}))

import { getConversations, getMessages, sendMessage, deleteConversation } from '../inbox.service'
import { prisma } from '../../../lib/prisma'

const WS_ID = 'ws-1'

beforeEach(() => vi.clearAllMocks())

describe('getConversations', () => {
  it('returns conversations scoped to workspaceId', async () => {
    const mockConvs = [{ id: 'c1', status: 'OPEN', contact: { name: 'Ana' }, _count: { messages: 2 } }]
    vi.mocked(prisma.conversation.findMany).mockResolvedValue(mockConvs as any)

    const result = await getConversations(WS_ID, {})

    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WS_ID }) })
    )
    // getConversations now resolves an assignee per row (null when unassigned)
    // and derives unreadCount from the Prisma _count.messages aggregate.
    expect(result).toEqual(mockConvs.map(c => ({ ...c, assignedToUser: null, unreadCount: c._count.messages })))
  })

  it('applies status filter when provided', async () => {
    vi.mocked(prisma.conversation.findMany).mockResolvedValue([])

    await getConversations(WS_ID, { status: 'PENDING' })

    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: WS_ID, status: 'PENDING' })
      })
    )
  })

  it('excludes soft-deleted conversations from the where clause', async () => {
    vi.mocked(prisma.conversation.findMany).mockResolvedValue([])

    await getConversations(WS_ID, {})

    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: WS_ID, deletedAt: null })
      })
    )
  })
})

describe('getMessages', () => {
  it('returns messages for conversation in workspaceId', async () => {
    const mockMsgs = [{ id: 'm1', content: 'Hola', direction: 'INBOUND' }]
    vi.mocked(prisma.message.findMany).mockResolvedValue(mockMsgs as any)

    const result = await getMessages(WS_ID, 'conv-1', undefined)

    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WS_ID, conversationId: 'conv-1' }) })
    )
    expect(result).toEqual(mockMsgs)
  })

  it('queries the newest messages first, then returns them oldest-to-newest', async () => {
    // Prisma is mocked to return them as the desc-ordered query would (newest first) —
    // a conversation with more than 50 messages must still surface its latest ones.
    const newestFirst = [
      { id: 'm3', content: 'Tercero', sentAt: new Date('2026-01-03') },
      { id: 'm2', content: 'Segundo', sentAt: new Date('2026-01-02') },
      { id: 'm1', content: 'Primero', sentAt: new Date('2026-01-01') }
    ]
    vi.mocked(prisma.message.findMany).mockResolvedValue(newestFirst as any)

    const result = await getMessages(WS_ID, 'conv-1', undefined)

    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { sentAt: 'desc' }, take: 50 })
    )
    expect(result.map(m => m.id)).toEqual(['m1', 'm2', 'm3'])
  })
})

describe('sendMessage', () => {
  it('throws if conversation not found in workspace', async () => {
    vi.mocked(prisma.conversation.findFirst).mockResolvedValue(null)

    await expect(sendMessage(WS_ID, 'conv-x', 'user-1', 'Hola')).rejects.toThrow('Conversation not found')
  })

  it('creates outbound message and dispatches to channel service', async () => {
    const mockChannel = { id: 'ch-1', platform: 'WHATSAPP', config: { phoneNumberId: 'ph1', accessToken: 'tok' } }
    const mockContact = { id: 'ct-1', phone: '+56912345678' }
    const mockConv = { id: 'conv-1', workspaceId: WS_ID, channelId: 'ch-1', contactId: 'ct-1' }
    const mockMsg = { id: 'msg-out', conversationId: 'conv-1', direction: 'OUTBOUND', senderType: 'AGENT', content: 'Hola', sentAt: new Date() }

    vi.mocked(prisma.conversation.findFirst).mockResolvedValue(mockConv as any)
    vi.mocked(prisma.channel.findUnique).mockResolvedValue(mockChannel as any)
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(mockContact as any)
    vi.mocked(prisma.message.create).mockResolvedValue(mockMsg as any)
    vi.mocked(prisma.conversation.update).mockResolvedValue(mockConv as any)

    const { sendWhatsAppMessage } = await import('../channels/whatsapp.service')

    await sendMessage(WS_ID, 'conv-1', 'user-1', 'Hola')

    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ direction: 'OUTBOUND', senderType: 'AGENT', content: 'Hola' })
      })
    )
    expect(sendWhatsAppMessage).toHaveBeenCalledWith('ph1', 'tok', '+56912345678', 'Hola')
  })

  it('native WhatsApp sends to conversation.externalId, not contact.phone (which may be an unresolved lid)', async () => {
    const mockChannel = { id: 'ch-1', platform: 'WHATSAPP', config: { isNative: true } }
    // contact.phone is a bare lid pseudo-number — not a valid whatsapp-web.js chatId on its own.
    const mockContact = { id: 'ct-1', phone: '61645766283373' }
    const mockConv = { id: 'conv-1', workspaceId: WS_ID, channelId: 'ch-1', contactId: 'ct-1', externalId: '61645766283373@lid' }
    const mockMsg = { id: 'msg-out', conversationId: 'conv-1', direction: 'OUTBOUND', senderType: 'AGENT', content: 'ok', sentAt: new Date() }

    vi.mocked(prisma.conversation.findFirst).mockResolvedValue(mockConv as any)
    vi.mocked(prisma.channel.findUnique).mockResolvedValue(mockChannel as any)
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(mockContact as any)
    vi.mocked(prisma.message.create).mockResolvedValue(mockMsg as any)
    vi.mocked(prisma.conversation.update).mockResolvedValue(mockConv as any)

    await sendMessage(WS_ID, 'conv-1', 'user-1', 'ok')

    expect(nativeSendMessage).toHaveBeenCalledWith(WS_ID, '61645766283373@lid', 'ok')
  })

  it('native WhatsApp keeps status PENDING and stores externalId — real status arrives later via message_ack', async () => {
    const mockChannel = { id: 'ch-1', platform: 'WHATSAPP', config: { isNative: true } }
    const mockContact = { id: 'ct-1', phone: '56912345678' }
    const mockConv = { id: 'conv-1', workspaceId: WS_ID, channelId: 'ch-1', contactId: 'ct-1', externalId: '56912345678@c.us' }
    const mockMsg = { id: 'msg-out', conversationId: 'conv-1', direction: 'OUTBOUND', senderType: 'AGENT', content: 'ok', sentAt: new Date() }

    vi.mocked(prisma.conversation.findFirst).mockResolvedValue(mockConv as any)
    vi.mocked(prisma.channel.findUnique).mockResolvedValue(mockChannel as any)
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(mockContact as any)
    vi.mocked(prisma.message.create).mockResolvedValue(mockMsg as any)
    vi.mocked(prisma.conversation.update).mockResolvedValue(mockConv as any)

    await sendMessage(WS_ID, 'conv-1', 'user-1', 'ok')

    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: 'msg-out' },
      data: { status: 'PENDING', externalId: 'wa-native-1' }
    })
  })

  it('non-native platforms still mark SENT immediately on dispatch (no ACK tracking there)', async () => {
    const mockChannel = { id: 'ch-1', platform: 'WHATSAPP', config: { phoneNumberId: 'ph1', accessToken: 'tok' } }
    const mockContact = { id: 'ct-1', phone: '+56912345678' }
    const mockConv = { id: 'conv-1', workspaceId: WS_ID, channelId: 'ch-1', contactId: 'ct-1' }
    const mockMsg = { id: 'msg-out', conversationId: 'conv-1', direction: 'OUTBOUND', senderType: 'AGENT', content: 'Hola', sentAt: new Date() }

    vi.mocked(prisma.conversation.findFirst).mockResolvedValue(mockConv as any)
    vi.mocked(prisma.channel.findUnique).mockResolvedValue(mockChannel as any)
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(mockContact as any)
    vi.mocked(prisma.message.create).mockResolvedValue(mockMsg as any)
    vi.mocked(prisma.conversation.update).mockResolvedValue(mockConv as any)

    await sendMessage(WS_ID, 'conv-1', 'user-1', 'Hola')

    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: 'msg-out' },
      data: { status: 'SENT', externalId: undefined }
    })
  })
})

describe('deleteConversation', () => {
  it('throws if conversation not found in workspace', async () => {
    vi.mocked(prisma.conversation.findFirst).mockResolvedValue(null)

    await expect(deleteConversation(WS_ID, 'conv-x')).rejects.toThrow('Conversation not found')
  })

  it('soft-deletes by setting deletedAt instead of removing the row', async () => {
    vi.mocked(prisma.conversation.findFirst).mockResolvedValue({ id: 'conv-1' } as any)
    vi.mocked(prisma.conversation.update).mockResolvedValue({} as any)

    await deleteConversation(WS_ID, 'conv-1')

    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conv-1' },
      data: { deletedAt: expect.any(Date) }
    })
  })
})
