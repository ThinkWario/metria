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
    message: { create: vi.fn() },
    botAgent: { findFirst: vi.fn() }
  }
}))

vi.mock('../../../lib/socket', () => ({
  getIO: vi.fn(() => ({
    to: vi.fn().mockReturnThis(),
    emit: vi.fn()
  }))
}))

vi.mock('../../ai-agent/ai.service', () => ({ processAiResponse: vi.fn(async () => null) }))
vi.mock('../../ai-agent/followup.service', () => ({
  cancelPendingFollowUps: vi.fn(async () => undefined),
  scheduleNextFollowUp: vi.fn(async () => undefined)
}))
vi.mock('../inbox.service', () => ({ trackAiMetric: vi.fn(async () => undefined) }))
vi.mock('../../bot/flow.engine', () => ({ tryRunBotFlows: vi.fn(async () => undefined) }))
vi.mock('../../crm/lifecycle.service', () => ({ LifecycleService: { handleSignal: vi.fn(async () => undefined) } }))
vi.mock('../channels/whatsapp.service', () => ({ sendWhatsAppMessage: vi.fn(async () => undefined) }))
vi.mock('../channels/instagram.service', () => ({ sendInstagramMessage: vi.fn(async () => undefined) }))
vi.mock('../channels/telegram.service', () => ({ sendTelegramMessage: vi.fn(async () => undefined) }))

import { processInboundMessage } from '../message.service'
import { prisma } from '../../../lib/prisma'
import { getIO } from '../../../lib/socket'
import { processAiResponse } from '../../ai-agent/ai.service'
import { sendTelegramMessage } from '../channels/telegram.service'

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

  it('persists the AI bot reply and bumps lastMessageAt (inbound AI path)', async () => {
    // isAiEnabled lives inside the channel config JSON (that's where the service reads it)
    const mockChannel = { id: CHANNEL_ID, platform: 'TELEGRAM', config: { botToken: 'tok', isAiEnabled: true } }
    const mockContact = { id: 'contact-1', name: 'Juan', status: 'LEAD', phone: '+56912345678' }
    const mockConversation = {
      id: 'conv-ai', workspaceId: WORKSPACE_ID, channelId: CHANNEL_ID,
      externalId: 'ext-conv-1', status: 'OPEN', messageCount: 2,
      isHandledByBot: true, contact: mockContact, createdAt: new Date()
    }
    const inboundMsg = { id: 'msg-in', conversationId: 'conv-ai', direction: 'INBOUND', senderType: 'CONTACT', content: baseData.content, sentAt: new Date() }
    const botMsg = { id: 'msg-bot', conversationId: 'conv-ai', direction: 'OUTBOUND', senderType: 'BOT', content: 'Tu pedido va en camino', sentAt: new Date() }

    vi.mocked(prisma.channel.findUnique).mockResolvedValue(mockChannel as any)
    vi.mocked(prisma.contact.upsert).mockResolvedValue(mockContact as any)
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue(mockConversation as any)
    vi.mocked(prisma.conversation.update).mockResolvedValue({
      ...mockConversation, messageCount: 3, assignedToBotId: 'bot-1',
      channel: { platform: 'TELEGRAM', config: { botToken: 'tok' } }
    } as any)
    vi.mocked(prisma.message.create)
      .mockResolvedValueOnce(inboundMsg as any) // inbound persist
      .mockResolvedValueOnce(botMsg as any) // bot reply persist
    vi.mocked(processAiResponse).mockResolvedValueOnce('Tu pedido va en camino')

    await processInboundMessage(baseData)

    // reply was sent through the platform...
    expect(sendTelegramMessage).toHaveBeenCalledWith('tok', 'ext-conv-1', 'Tu pedido va en camino')
    // ...AND persisted as an OUTBOUND BOT message
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: 'conv-ai', direction: 'OUTBOUND', senderType: 'BOT',
          content: 'Tu pedido va en camino', status: 'SENT'
        })
      })
    )
    // conversation freshness updated after the bot reply
    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'conv-ai' }, data: { lastMessageAt: expect.any(Date) } })
    )
  })
})
