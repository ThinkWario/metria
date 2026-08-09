import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    channel: { findUnique: vi.fn() },
    contact: { upsert: vi.fn(), update: vi.fn() },
    conversation: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    message: { create: vi.fn(), findFirst: vi.fn(async () => null) },
    botAgent: { findFirst: vi.fn() },
    whatsAppTemplate: { findFirst: vi.fn() }
  }
}))

vi.mock('../../../lib/socket', () => ({
  getIO: vi.fn(() => ({
    to: vi.fn().mockReturnThis(),
    emit: vi.fn()
  }))
}))

// AI dispatch is a fire-and-forget hand-off in message.service; the actual
// generation/retry/debounce contract is covered in aiResponder.test.ts.
vi.mock('../../ai-agent/aiResponder', () => ({ scheduleAiReply: vi.fn() }))
vi.mock('../../ai-agent/followup.service', () => ({
  cancelPendingFollowUps: vi.fn(async () => undefined),
  scheduleNextFollowUp: vi.fn(async () => undefined)
}))
vi.mock('../inbox.service', () => ({ trackAiMetric: vi.fn(async () => undefined) }))
vi.mock('../../bot/flow.engine', () => ({ tryRunBotFlows: vi.fn(async () => undefined) }))
vi.mock('../../crm/lifecycle.service', () => ({ LifecycleService: { handleSignal: vi.fn(async () => undefined) } }))
vi.mock('../channels/whatsapp.service', () => ({
  sendWhatsAppMessage: vi.fn(async () => undefined),
  sendWhatsAppTemplateMessage: vi.fn(async () => undefined)
}))
vi.mock('../channels/instagram.service', () => ({ sendInstagramMessage: vi.fn(async () => undefined) }))
vi.mock('../channels/telegram.service', () => ({ sendTelegramMessage: vi.fn(async () => undefined) }))
const nativeSendMessage = vi.fn(async () => 'wa-out-99')
vi.mock('../../../lib/whatsapp/WhatsAppManager', () => ({
  WhatsAppSessionManager: { getInstance: () => ({ sendMessage: nativeSendMessage }) }
}))

import { processInboundMessage, sendOutboundPlatformMessage, sendInternalWhatsAppTemplate, sendOutboundWhatsAppTemplate } from '../message.service'
import { prisma } from '../../../lib/prisma'
import { getIO } from '../../../lib/socket'
import { scheduleAiReply } from '../../ai-agent/aiResponder'
import { tryRunBotFlows } from '../../bot/flow.engine'
import { sendWhatsAppTemplateMessage } from '../channels/whatsapp.service'

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
      externalId: 'ext-conv-1', status: 'OPEN', messageCount: 5, contactId: 'contact-existing',
      contact: mockContact, createdAt: new Date()
    }
    const mockMessage = {
      id: 'msg-2', conversationId: 'conv-existing', direction: 'INBOUND',
      senderType: 'CONTACT', content: baseData.content, sentAt: new Date()
    }

    vi.mocked(prisma.channel.findUnique).mockResolvedValue(mockChannel as any)
    vi.mocked(prisma.contact.update).mockResolvedValue(mockContact as any)
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue(mockConversation as any)
    vi.mocked(prisma.conversation.update).mockResolvedValue({ ...mockConversation, messageCount: 6 } as any)
    vi.mocked(prisma.message.create).mockResolvedValue(mockMessage as any)

    const result = await processInboundMessage(baseData)

    // Existing conversation → the contact is updated (phone migrated to the clean value), not re-upserted.
    expect(prisma.contact.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'contact-existing' } })
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

  it('hands off to the debounced AI responder when the channel has AI enabled (inbound AI path)', async () => {
    // isAiEnabled lives inside the channel config JSON (that's where the service reads it)
    const mockChannel = { id: CHANNEL_ID, platform: 'TELEGRAM', config: { botToken: 'tok', isAiEnabled: true } }
    const mockContact = { id: 'contact-1', name: 'Juan', status: 'LEAD', phone: '+56912345678' }
    const mockConversation = {
      id: 'conv-ai', workspaceId: WORKSPACE_ID, channelId: CHANNEL_ID,
      externalId: 'ext-conv-1', status: 'OPEN', messageCount: 2, contactId: 'contact-1',
      isHandledByBot: true, contact: mockContact, createdAt: new Date()
    }
    const inboundMsg = { id: 'msg-in', conversationId: 'conv-ai', direction: 'INBOUND', senderType: 'CONTACT', content: baseData.content, sentAt: new Date() }

    vi.mocked(prisma.channel.findUnique).mockResolvedValue(mockChannel as any)
    vi.mocked(prisma.contact.update).mockResolvedValue(mockContact as any)
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue(mockConversation as any)
    vi.mocked(prisma.conversation.update).mockResolvedValue({
      ...mockConversation, messageCount: 3, assignedToBotId: 'bot-1',
      channel: { platform: 'TELEGRAM', config: { botToken: 'tok' } }
    } as any)
    vi.mocked(prisma.message.create).mockResolvedValueOnce(inboundMsg as any)

    await processInboundMessage(baseData)

    // Generation/retry/send is aiResponder's job — message.service only enqueues it.
    expect(scheduleAiReply).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      conversationId: 'conv-ai',
      channelId: CHANNEL_ID,
      content: baseData.content
    })
    expect(tryRunBotFlows).not.toHaveBeenCalled()
  })

  it('does not trigger the AI agent or the rules engine when skipBotResponse is set', async () => {
    const mockChannel = { id: CHANNEL_ID, platform: 'WHATSAPP', config: { isAiEnabled: true } }
    const mockContact = { id: 'contact-1', name: 'Juan Pérez', phone: '+56912345678', status: 'LEAD' }
    const mockConversation = {
      id: 'conv-1', workspaceId: WORKSPACE_ID, channelId: CHANNEL_ID,
      externalId: 'ext-conv-1', status: 'OPEN', isHandledByBot: true, contactId: 'contact-1',
      contact: mockContact
    }
    const mockMessage = { id: 'msg-1', conversationId: 'conv-1', direction: 'INBOUND', senderType: 'CONTACT', content: baseData.content, sentAt: new Date() }

    vi.mocked(prisma.channel.findUnique).mockResolvedValue(mockChannel as any)
    vi.mocked(prisma.contact.update).mockResolvedValue(mockContact as any)
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue(mockConversation as any)
    vi.mocked(prisma.conversation.update).mockResolvedValue({ ...mockConversation, messageCount: 6 } as any)
    vi.mocked(prisma.message.create).mockResolvedValue(mockMessage as any)

    await processInboundMessage({ ...baseData, skipBotResponse: true })

    expect(scheduleAiReply).not.toHaveBeenCalled()
    expect(tryRunBotFlows).not.toHaveBeenCalled()
    expect(prisma.message.create).toHaveBeenCalledTimes(1)
  })

  it('dedups a replayed inbound message (same externalId) instead of creating a duplicate', async () => {
    const mockChannel = { id: CHANNEL_ID, platform: 'WHATSAPP' }
    const mockContact = { id: 'contact-1', name: 'Juan Pérez', status: 'LEAD', phone: '+56912345678' }
    const mockConversation = {
      id: 'conv-1', workspaceId: WORKSPACE_ID, channelId: CHANNEL_ID,
      externalId: 'ext-conv-1', status: 'OPEN', messageCount: 1, contactId: 'contact-1',
      contact: mockContact, createdAt: new Date()
    }

    vi.mocked(prisma.channel.findUnique).mockResolvedValue(mockChannel as any)
    vi.mocked(prisma.contact.update).mockResolvedValue(mockContact as any)
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue(mockConversation as any)
    vi.mocked(prisma.message.findFirst).mockResolvedValueOnce({ id: 'existing-msg' } as any)

    const result = await processInboundMessage(baseData)

    expect(result.messageId).toBe('existing-msg')
    expect(prisma.message.create).not.toHaveBeenCalled()
    expect(prisma.conversation.update).not.toHaveBeenCalled()
  })

  it('revives a soft-deleted conversation on a new inbound message and re-emits conversation:new', async () => {
    const mockChannel = { id: CHANNEL_ID, platform: 'TELEGRAM' }
    const mockContact = { id: 'contact-revived', name: 'Juan', status: 'CUSTOMER', phone: '+56912345678' }
    const mockConversation = {
      id: 'conv-revived', workspaceId: WORKSPACE_ID, channelId: CHANNEL_ID,
      externalId: 'ext-conv-1', status: 'OPEN', messageCount: 3, contactId: 'contact-revived',
      contact: mockContact, createdAt: new Date(), deletedAt: new Date('2026-08-01')
    }
    const mockMessage = {
      id: 'msg-revived', conversationId: 'conv-revived', direction: 'INBOUND',
      senderType: 'CONTACT', content: baseData.content, sentAt: new Date()
    }

    vi.mocked(prisma.channel.findUnique).mockResolvedValue(mockChannel as any)
    vi.mocked(prisma.contact.update).mockResolvedValue(mockContact as any)
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue(mockConversation as any)
    vi.mocked(prisma.conversation.update).mockResolvedValue({ ...mockConversation, deletedAt: null, messageCount: 4 } as any)
    vi.mocked(prisma.message.create).mockResolvedValue(mockMessage as any)

    const mockIO = { to: vi.fn().mockReturnThis(), emit: vi.fn() }
    vi.mocked(getIO).mockReturnValue(mockIO as any)

    const result = await processInboundMessage(baseData)

    expect(result.isNewConversation).toBe(true)
    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'conv-revived' },
        data: expect.objectContaining({ deletedAt: null })
      })
    )
    expect(mockIO.emit).toHaveBeenCalledWith('conversation:new', expect.objectContaining({ id: 'conv-revived' }))
  })
})

describe('sendOutboundPlatformMessage', () => {
  it('keeps native WhatsApp sends PENDING and stores externalId for later message_ack correlation', async () => {
    const mockConv = {
      id: 'conv-1', workspaceId: WORKSPACE_ID, externalId: 'ext-1',
      channel: { platform: 'WHATSAPP', config: { isNative: true } }
    }
    const mockMessage = { id: 'msg-out', conversationId: 'conv-1', direction: 'OUTBOUND', senderType: 'BOT', content: 'Hola', sentAt: new Date() }

    vi.mocked(prisma.conversation.findUnique).mockResolvedValue(mockConv as any)
    vi.mocked(prisma.message.create).mockResolvedValue(mockMessage as any)
    vi.mocked(prisma.conversation.update).mockResolvedValue(mockConv as any)

    await sendOutboundPlatformMessage(WORKSPACE_ID, 'conv-1', 'Hola', 'BOT')

    expect(nativeSendMessage).toHaveBeenCalledWith(WORKSPACE_ID, 'ext-1', 'Hola')
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: {
        workspaceId: WORKSPACE_ID, conversationId: 'conv-1', direction: 'OUTBOUND',
        senderType: 'BOT', content: 'Hola', status: 'PENDING', externalId: 'wa-out-99'
      }
    })
  })

  it('marks non-native platforms SENT immediately (no ACK tracking there)', async () => {
    const mockConv = {
      id: 'conv-2', workspaceId: WORKSPACE_ID, externalId: 'ext-2',
      channel: { platform: 'TELEGRAM', config: { botToken: 'tok' } }
    }
    const mockMessage = { id: 'msg-out-2', conversationId: 'conv-2', direction: 'OUTBOUND', senderType: 'BOT', content: 'Hola', sentAt: new Date() }

    vi.mocked(prisma.conversation.findUnique).mockResolvedValue(mockConv as any)
    vi.mocked(prisma.message.create).mockResolvedValue(mockMessage as any)
    vi.mocked(prisma.conversation.update).mockResolvedValue(mockConv as any)

    await sendOutboundPlatformMessage(WORKSPACE_ID, 'conv-2', 'Hola', 'BOT')

    expect(prisma.message.create).toHaveBeenCalledWith({
      data: {
        workspaceId: WORKSPACE_ID, conversationId: 'conv-2', direction: 'OUTBOUND',
        senderType: 'BOT', content: 'Hola', status: 'SENT', externalId: undefined
      }
    })
  })
})

describe('sendInternalWhatsAppTemplate', () => {
  const CHANNEL = { id: CHANNEL_ID, platform: 'WHATSAPP', name: 'WhatsApp Principal', config: { phoneNumberId: 'pn-1', accessToken: 'tok' } }
  const TEMPLATE = { id: 'tpl-1', name: 'aviso_visita_tecnica', language: 'es', bodyText: 'Nueva visita: {{1}} — {{2}} — {{3}}', status: 'APPROVED' }
  const TO = '56921789410'

  beforeEach(() => {
    vi.mocked(prisma.channel.findUnique).mockResolvedValue(CHANNEL as any)
    vi.mocked(prisma.whatsAppTemplate.findFirst).mockResolvedValue(TEMPLATE as any)
    vi.mocked(prisma.contact.upsert).mockResolvedValue({ id: 'ct-tech', name: 'Encargado de visitas', phone: TO } as any)
    vi.mocked(prisma.message.create).mockResolvedValue({ id: 'msg-tech', sentAt: new Date() } as any)
    const mockIO = { to: vi.fn().mockReturnThis(), emit: vi.fn() }
    vi.mocked(getIO).mockReturnValue(mockIO as any)
  })

  it('creates a Contact + Conversation and broadcasts both when none exist yet', async () => {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.conversation.create).mockResolvedValue({ id: 'conv-tech', status: 'PENDING', createdAt: new Date() } as any)

    await sendInternalWhatsAppTemplate(WORKSPACE_ID, CHANNEL_ID, TO, 'tpl-1', ['Alexis', '56942597739', '10 de agosto a las 09:00'])

    expect(prisma.contact.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { workspaceId_phone: { workspaceId: WORKSPACE_ID, phone: TO } },
      create: expect.objectContaining({ phone: TO, source: 'INTERNAL' })
    }))
    expect(prisma.conversation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ contactId: 'ct-tech', externalId: TO, channelId: CHANNEL_ID })
    }))
    expect(sendWhatsAppTemplateMessage).toHaveBeenCalledWith(
      'pn-1', 'tok', TO, 'aviso_visita_tecnica', 'es', ['Alexis', '56942597739', '10 de agosto a las 09:00']
    )
    expect(prisma.message.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ conversationId: 'conv-tech', content: 'Nueva visita: Alexis — 56942597739 — 10 de agosto a las 09:00' })
    }))
    const mockIO = vi.mocked(getIO).mock.results[0].value
    expect(mockIO.emit).toHaveBeenCalledWith('conversation:new', expect.objectContaining({ id: 'conv-tech' }))
    expect(mockIO.emit).toHaveBeenCalledWith('message:new', expect.objectContaining({ id: 'msg-tech' }))
  })

  it('reuses an existing Conversation without re-emitting conversation:new', async () => {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({ id: 'conv-existing', status: 'OPEN' } as any)

    await sendInternalWhatsAppTemplate(WORKSPACE_ID, CHANNEL_ID, TO, 'tpl-1', ['Alexis', '56942597739', 'hoy'])

    expect(prisma.conversation.create).not.toHaveBeenCalled()
    const mockIO = vi.mocked(getIO).mock.results[0].value
    expect(mockIO.emit).not.toHaveBeenCalledWith('conversation:new', expect.anything())
    expect(mockIO.emit).toHaveBeenCalledWith('message:new', expect.objectContaining({ conversationId: 'conv-existing' }))
  })

  it('throws when the template is not APPROVED for this channel', async () => {
    vi.mocked(prisma.whatsAppTemplate.findFirst).mockResolvedValue(null)

    await expect(sendInternalWhatsAppTemplate(WORKSPACE_ID, CHANNEL_ID, TO, 'tpl-missing'))
      .rejects.toThrow('not found or not APPROVED')
  })

  it('throws when the channel is not a connected WhatsApp channel', async () => {
    vi.mocked(prisma.channel.findUnique).mockResolvedValue(null)

    await expect(sendInternalWhatsAppTemplate(WORKSPACE_ID, CHANNEL_ID, TO, 'tpl-1'))
      .rejects.toThrow('WhatsApp channel not found')
  })
})

describe('sendOutboundWhatsAppTemplate', () => {
  it('increments conversation.messageCount when the template send succeeds', async () => {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
      id: 'conv-1',
      channelId: CHANNEL_ID,
      externalId: '56912345678',
      channel: { platform: 'WHATSAPP', config: { phoneNumberId: 'pn-1', accessToken: 'token-1' } },
      contact: { name: 'Herbert Orrego' }
    } as any)
    vi.mocked(prisma.whatsAppTemplate.findFirst).mockResolvedValue({
      id: 'tpl-1', channelId: CHANNEL_ID, status: 'APPROVED',
      name: 'confirmacion_visita', language: 'es', bodyText: 'Hola {{1}}, gracias por tu interés.'
    } as any)
    vi.mocked(prisma.message.create).mockResolvedValue({
      id: 'msg-1', conversationId: 'conv-1', direction: 'OUTBOUND', senderType: 'BOT',
      content: 'Hola Herbert Orrego, gracias por tu interés.', status: 'SENT', sentAt: new Date('2026-08-09T12:00:00.000Z')
    } as any)

    await sendOutboundWhatsAppTemplate(WORKSPACE_ID, 'conv-1', 'tpl-1')

    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conv-1' },
      data: expect.objectContaining({ messageCount: { increment: 1 } })
    })
  })
})
