import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    channel: { findUnique: vi.fn() },
    contact: { upsert: vi.fn() },
    conversation: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    message: { create: vi.fn() }
  }
}))

vi.mock('../../../lib/socket', () => ({
  getIO: vi.fn(() => ({
    to: vi.fn().mockReturnThis(),
    emit: vi.fn()
  }))
}))

import { processInboundMessage } from '../message.service'
import { prisma } from '../../../lib/prisma'
import { getIO } from '../../../lib/socket'

const WORKSPACE_ID = 'ws-1'
const CHANNEL_ID = 'ch-1'

const baseData = {
  workspaceId: WORKSPACE_ID,
  channelId: CHANNEL_ID,
  externalConversationId: 'ext-conv-1',
  externalMessageId: 'ext-msg-1',
  senderExternalId: '+56912345678',
  senderName: 'Juan Pérez',
  content: 'Hola, ¿dónde está mi pedido?'
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('processInboundMessage', () => {
  it('creates a new contact when none exists with that phone', async () => {
    const mockChannel = { id: CHANNEL_ID, platform: 'TELEGRAM' }
    const mockContact = { id: 'contact-1', name: 'Juan Pérez', status: 'LEAD', phone: '+56912345678' }
    const mockConversation = {
      id: 'conv-1', workspaceId: WORKSPACE_ID, channelId: CHANNEL_ID,
      externalId: 'ext-conv-1', status: 'OPEN', messageCount: 0,
      contact: mockContact, createdAt: new Date()
    }
    const mockMessage = {
      id: 'msg-1', conversationId: 'conv-1', direction: 'INBOUND',
      senderType: 'CONTACT', content: baseData.content, sentAt: new Date()
    }

    vi.mocked(prisma.channel.findUnique).mockResolvedValue(mockChannel as any)
    vi.mocked(prisma.contact.upsert).mockResolvedValue(mockContact as any)
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.conversation.create).mockResolvedValue(mockConversation as any)
    vi.mocked(prisma.conversation.update).mockResolvedValue({ ...mockConversation, messageCount: 1 } as any)
    vi.mocked(prisma.message.create).mockResolvedValue(mockMessage as any)

    const result = await processInboundMessage(baseData)

    expect(prisma.contact.upsert).toHaveBeenCalledWith({
      where: { workspaceId_phone: { workspaceId: WORKSPACE_ID, phone: '+56912345678' } },
      create: expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        phone: '+56912345678',
        name: 'Juan Pérez',
        source: 'TELEGRAM',
        status: 'LEAD'
      }),
      update: {}
    })
    expect(result.isNewConversation).toBe(true)
    expect(result.contactId).toBe('contact-1')
  })

  it('reuses existing contact when phone matches', async () => {
    const mockChannel = { id: CHANNEL_ID, platform: 'TELEGRAM' }
    const mockContact = { id: 'contact-existing', name: 'Juan', status: 'CUSTOMER', phone: '+56912345678' }
    const mockConversation = {
      id: 'conv-existing', workspaceId: WORKSPACE_ID, channelId: CHANNEL_ID,
      externalId: 'ext-conv-1', status: 'OPEN', messageCount: 5,
      contact: mockContact, createdAt: new Date()
    }
    const mockMessage = {
      id: 'msg-2', conversationId: 'conv-existing', direction: 'INBOUND',
      senderType: 'CONTACT', content: baseData.content, sentAt: new Date()
    }

    vi.mocked(prisma.channel.findUnique).mockResolvedValue(mockChannel as any)
    vi.mocked(prisma.contact.upsert).mockResolvedValue(mockContact as any)
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue(mockConversation as any)
    vi.mocked(prisma.conversation.update).mockResolvedValue({ ...mockConversation, messageCount: 6 } as any)
    vi.mocked(prisma.message.create).mockResolvedValue(mockMessage as any)

    const result = await processInboundMessage(baseData)

    expect(prisma.contact.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: {} })
    )
    expect(result.isNewConversation).toBe(false)
    expect(result.contactId).toBe('contact-existing')
  })

  it('emits conversation:new and message:new on first message in a thread', async () => {
    const mockChannel = { id: CHANNEL_ID, platform: 'TELEGRAM' }
    const mockContact = { id: 'c1', name: 'Ana', status: 'LEAD', phone: '+56911111111' }
    const mockConversation = {
      id: 'conv-new', workspaceId: WORKSPACE_ID, channelId: CHANNEL_ID,
      externalId: 'ext-conv-1', status: 'OPEN', messageCount: 0,
      contact: mockContact, createdAt: new Date()
    }
    const mockMessage = { id: 'msg-3', conversationId: 'conv-new', direction: 'INBOUND', senderType: 'CONTACT', content: 'Hi', sentAt: new Date() }
    const mockIO = { to: vi.fn().mockReturnThis(), emit: vi.fn() }

    vi.mocked(prisma.channel.findUnique).mockResolvedValue(mockChannel as any)
    vi.mocked(prisma.contact.upsert).mockResolvedValue(mockContact as any)
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.conversation.create).mockResolvedValue(mockConversation as any)
    vi.mocked(prisma.conversation.update).mockResolvedValue({ ...mockConversation, messageCount: 1 } as any)
    vi.mocked(prisma.message.create).mockResolvedValue(mockMessage as any)
    vi.mocked(getIO).mockReturnValue(mockIO as any)

    await processInboundMessage({ ...baseData, senderExternalId: '+56911111111' })

    expect(mockIO.to).toHaveBeenCalledWith(`workspace:${WORKSPACE_ID}`)
    expect(mockIO.emit).toHaveBeenCalledWith('conversation:new', expect.objectContaining({ id: 'conv-new' }))
    expect(mockIO.emit).toHaveBeenCalledWith('message:new', expect.objectContaining({ id: 'msg-3' }))
  })
})
