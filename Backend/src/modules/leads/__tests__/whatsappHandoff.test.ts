import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    conversation: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    message: { create: vi.fn() },
    whatsAppTemplate: { findFirst: vi.fn() }
  }
}))

vi.mock('../../../lib/socket', () => ({
  getIO: vi.fn(() => ({
    to: vi.fn().mockReturnThis(),
    emit: vi.fn()
  }))
}))

vi.mock('../../messaging/message.service', () => ({
  sendOutboundPlatformMessage: vi.fn(async () => ({ id: 'm1' }))
}))
vi.mock('../../messaging/channels/whatsapp.service', () => ({
  sendWhatsAppTemplateMessage: vi.fn(async () => undefined)
}))

import { prepareWhatsappConversation } from '../whatsappHandoff'
import { prisma } from '../../../lib/prisma'

const WS = 'ws-1'
const CONTACT = { id: 'c1', name: 'Alexis Carvajal', phone: '56942597739' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.conversation.findUnique).mockResolvedValue(null)
  vi.mocked(prisma.conversation.create).mockResolvedValue({ id: 'conv1', status: 'PENDING', createdAt: new Date() } as any)
  vi.mocked(prisma.message.create).mockResolvedValue({ id: 'note1', content: '', sentAt: new Date() } as any)
})

describe('prepareWhatsappConversation — externalId format', () => {
  it('uses bare digits (no "@c.us") for a Cloud API channel, matching what the inbound webhook sends as msg.from', async () => {
    const channel = { id: 'ch1', config: { isNative: false } }

    await prepareWhatsappConversation(WS, channel, CONTACT, null)

    expect(prisma.conversation.findUnique).toHaveBeenCalledWith({
      where: { workspaceId_channelId_externalId: { workspaceId: WS, channelId: 'ch1', externalId: '56942597739' } }
    })
    expect(prisma.conversation.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ externalId: '56942597739' }) })
    )
  })

  it('keeps the "@c.us" suffix for a native (whatsapp-web.js) channel', async () => {
    const channel = { id: 'ch1', config: { isNative: true } }

    await prepareWhatsappConversation(WS, channel, CONTACT, null)

    expect(prisma.conversation.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ externalId: '56942597739@c.us' }) })
    )
  })

  it('does not create a duplicate conversation when one already exists under the Cloud API externalId', async () => {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({ id: 'conv-existing' } as any)
    const channel = { id: 'ch1', config: { isNative: false } }

    await prepareWhatsappConversation(WS, channel, CONTACT, null)

    expect(prisma.conversation.create).not.toHaveBeenCalled()
  })
})
