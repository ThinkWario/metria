import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    botFlow: { findMany: vi.fn() },
    conversation: { update: vi.fn() },
    contact: { findUnique: vi.fn() },
    message: { create: vi.fn() },
    businessHours: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() }
  }
}))
vi.mock('../../messaging/channels/whatsapp.service', () => ({ sendWhatsAppMessage: vi.fn() }))
vi.mock('../../messaging/channels/instagram.service', () => ({ sendInstagramMessage: vi.fn() }))
vi.mock('../../messaging/channels/telegram.service', () => ({ sendTelegramMessage: vi.fn() }))
vi.mock('../../crm/ticket.service', () => ({ createTicket: vi.fn() }))
vi.mock('../../crm/contact.service', () => ({ updateContact: vi.fn() }))
vi.mock('../businessHours.service', () => ({ isOutsideBusinessHours: vi.fn() }))

import { tryRunBotFlows } from '../flow.engine'
import { prisma } from '../../../lib/prisma'
import { sendWhatsAppMessage } from '../../messaging/channels/whatsapp.service'
import { createTicket } from '../../crm/ticket.service'
import { updateContact } from '../../crm/contact.service'
import { isOutsideBusinessHours } from '../businessHours.service'

const WS = 'ws-1'
const CH = 'ch-1'

const makeConv = (overrides: Record<string, unknown> = {}) => ({
  id: 'conv-1', workspaceId: WS, channelId: CH, contactId: 'ct-1',
  externalId: '+56912345678', messageCount: 1, isHandledByBot: true,
  assignedToUserId: null,
  channel: { platform: 'WHATSAPP', config: { phoneNumberId: 'ph-1', accessToken: 'tok' } },
  ...overrides
})

const makeFlow = (overrides: Record<string, unknown> = {}) => ({
  id: 'f1', workspaceId: WS, channel: 'ALL', isActive: true,
  triggerType: 'KEYWORD', triggerValue: 'hola', priority: 100,
  actions: [{ type: 'send_message', content: 'Hola {nombre}!' }],
  botAgent: { isActive: true },
  ...overrides
})

beforeEach(() => vi.clearAllMocks())

describe('tryRunBotFlows', () => {
  it('skips entirely when isHandledByBot is false', async () => {
    await tryRunBotFlows(WS, CH, makeConv({ isHandledByBot: false }))
    expect(prisma.botFlow.findMany).not.toHaveBeenCalled()
  })

  it('sends interpolated message on KEYWORD match', async () => {
    vi.mocked(prisma.botFlow.findMany).mockResolvedValue([makeFlow()] as any)
    vi.mocked(prisma.contact.findUnique).mockResolvedValue({ name: 'Ana' } as any)
    vi.mocked(prisma.message.create).mockResolvedValue({} as any)
    vi.mocked(sendWhatsAppMessage as any).mockResolvedValue(undefined)

    await tryRunBotFlows(WS, CH, makeConv(), 'hola cómo están')

    expect(sendWhatsAppMessage).toHaveBeenCalledWith('ph-1', 'tok', '+56912345678', 'Hola Ana!')
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ direction: 'OUTBOUND', senderType: 'BOT' }) })
    )
  })

  it('does not send when KEYWORD does not match', async () => {
    vi.mocked(prisma.botFlow.findMany).mockResolvedValue([makeFlow({ triggerValue: 'precio' })] as any)
    await tryRunBotFlows(WS, CH, makeConv(), 'hola')
    expect(sendWhatsAppMessage).not.toHaveBeenCalled()
  })

  it('matches FIRST_MESSAGE when messageCount === 1', async () => {
    vi.mocked(prisma.botFlow.findMany).mockResolvedValue([
      makeFlow({ triggerType: 'FIRST_MESSAGE', triggerValue: null, actions: [{ type: 'wait_human' }] })
    ] as any)
    vi.mocked(prisma.conversation.update).mockResolvedValue({} as any)

    await tryRunBotFlows(WS, CH, makeConv({ messageCount: 1 }))

    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isHandledByBot: false }) })
    )
  })

  it('skips FIRST_MESSAGE when messageCount > 1', async () => {
    vi.mocked(prisma.botFlow.findMany).mockResolvedValue([
      makeFlow({ triggerType: 'FIRST_MESSAGE', triggerValue: null, actions: [{ type: 'wait_human' }] })
    ] as any)

    await tryRunBotFlows(WS, CH, makeConv({ messageCount: 3 }))

    expect(prisma.conversation.update).not.toHaveBeenCalled()
  })

  it('fires BUSINESS_HRS flow when outside hours', async () => {
    const bh = { workspaceId: WS, timezone: 'America/Santiago' }
    vi.mocked(prisma.botFlow.findMany).mockResolvedValue([
      makeFlow({ triggerType: 'BUSINESS_HRS', triggerValue: null, actions: [{ type: 'send_message', content: 'Estamos cerrados' }] })
    ] as any)
    vi.mocked(prisma.businessHours.findUnique).mockResolvedValue(bh as any)
    vi.mocked(isOutsideBusinessHours as any).mockReturnValue(true)
    vi.mocked(prisma.contact.findUnique).mockResolvedValue({ name: 'Ana' } as any)
    vi.mocked(prisma.message.create).mockResolvedValue({} as any)
    vi.mocked(sendWhatsAppMessage as any).mockResolvedValue(undefined)

    await tryRunBotFlows(WS, CH, makeConv(), 'hola')

    expect(sendWhatsAppMessage).toHaveBeenCalledWith('ph-1', 'tok', '+56912345678', 'Estamos cerrados')
  })

  it('creates ticket on create_ticket action', async () => {
    vi.mocked(prisma.botFlow.findMany).mockResolvedValue([
      makeFlow({ triggerValue: 'reclamo', actions: [{ type: 'create_ticket', priority: 'HIGH' }] })
    ] as any)
    vi.mocked(prisma.contact.findUnique).mockResolvedValue({ name: 'Ana' } as any)
    vi.mocked(createTicket as any).mockResolvedValue({})

    await tryRunBotFlows(WS, CH, makeConv(), 'tengo un reclamo')

    expect(createTicket).toHaveBeenCalledWith(
      WS, expect.objectContaining({ contactId: 'ct-1', priority: 'HIGH' })
    )
  })

  it('calls updateContact on update_stage action', async () => {
    vi.mocked(prisma.botFlow.findMany).mockResolvedValue([
      makeFlow({ actions: [{ type: 'update_stage', status: 'CUSTOMER' }] })
    ] as any)
    vi.mocked(prisma.contact.findUnique).mockResolvedValue({ name: 'Ana' } as any)
    vi.mocked(updateContact as any).mockResolvedValue({})

    await tryRunBotFlows(WS, CH, makeConv(), 'hola')

    expect(updateContact).toHaveBeenCalledWith(WS, 'ct-1', { status: 'CUSTOMER' })
  })

  it('stops at first matching flow (first wins)', async () => {
    vi.mocked(prisma.botFlow.findMany).mockResolvedValue([
      makeFlow({ id: 'f1', priority: 100, actions: [{ type: 'wait_human' }] }),
      makeFlow({ id: 'f2', priority: 200, actions: [{ type: 'create_ticket', priority: 'LOW' }] })
    ] as any)
    vi.mocked(prisma.conversation.update).mockResolvedValue({} as any)
    vi.mocked(prisma.contact.findUnique).mockResolvedValue({ name: 'Ana' } as any)

    await tryRunBotFlows(WS, CH, makeConv(), 'hola')

    expect(prisma.conversation.update).toHaveBeenCalledTimes(1)
    expect(createTicket).not.toHaveBeenCalled()
  })

  it('skips flow if botAgent is inactive', async () => {
    vi.mocked(prisma.botFlow.findMany).mockResolvedValue([
      makeFlow({ botAgent: { isActive: false } })
    ] as any)

    await tryRunBotFlows(WS, CH, makeConv(), 'hola')

    expect(sendWhatsAppMessage).not.toHaveBeenCalled()
  })

  it('skips flow if channel filter does not match', async () => {
    vi.mocked(prisma.botFlow.findMany).mockResolvedValue([
      makeFlow({ channel: 'TELEGRAM' })
    ] as any)

    await tryRunBotFlows(WS, CH, makeConv({ channel: { platform: 'WHATSAPP', config: {} } }), 'hola')

    expect(sendWhatsAppMessage).not.toHaveBeenCalled()
  })
})
