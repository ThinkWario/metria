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

import { getConversations, getMessages, sendMessage } from '../inbox.service'
import { prisma } from '../../../lib/prisma'

const WS_ID = 'ws-1'

beforeEach(() => vi.clearAllMocks())

describe('getConversations', () => {
  it('returns conversations scoped to workspaceId', async () => {
    const mockConvs = [{ id: 'c1', status: 'OPEN', contact: { name: 'Ana' } }]
    vi.mocked(prisma.conversation.findMany).mockResolvedValue(mockConvs as any)

    const result = await getConversations(WS_ID, {})

    expect(prisma.conversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WS_ID }) })
    )
    // getConversations now resolves an assignee per row (null when unassigned).
    expect(result).toEqual(mockConvs.map(c => ({ ...c, assignedToUser: null })))
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
})
