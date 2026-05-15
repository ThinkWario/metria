import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../lib/prisma'
import { getIO } from '../../../lib/socket'
import { parseMessengerUpdate } from '../channels/messenger.service'
import { sendMessengerMessage } from '../channels/messenger.service'
import { tryRunBotFlows } from '../../bot/flow.engine'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    channel: {
      findUnique: vi.fn(),
    },
    contact: {
      upsert: vi.fn(),
    },
    conversation: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    message: {
      create: vi.fn(),
    },
  },
}))

vi.mock('../../lib/socket', () => ({
  getIO: vi.fn().mockReturnValue({
    to: vi.fn().mockReturnValue({
      emit: vi.fn(),
    }),
  }),
}))

vi.mock('../../bot/flow.engine', () => ({
  tryRunBotFlows: vi.fn(),
}))

vi.mock('../channels/messenger.service', async () => {
  const actual = await vi.importActual('../channels/messenger.service')
  return {
    ...actual,
    sendMessengerMessage: vi.fn().mockResolvedValue(undefined),
  }
})

const WORKSPACE_ID = 'ws-integration'
const CHANNEL_ID = 'ch-messenger'

describe('Messaging Integration Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should process an inbound Messenger message and trigger a bot reply', async () => {
    // 1. Setup Mocks
    const mockChannel = { id: CHANNEL_ID, platform: 'MESSENGER', config: { pageAccessToken: 'token-123' } }
    vi.mocked(prisma.channel.findUnique).mockResolvedValue(mockChannel as any)

    const mockContact = { id: 'ct-1', phone: 'msgr_user-123' }
    vi.mocked(prisma.contact.upsert).mockResolvedValue(mockContact as any)

    const mockConversation = {
      id: 'conv-1',
      workspaceId: WORKSPACE_ID,
      channelId: CHANNEL_ID,
      externalId: 'user-123',
      contact: { id: 'ct-1', name: 'User 123' }
    }
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue(mockConversation as any)
    vi.mocked(prisma.conversation.update).mockResolvedValue(mockConversation as any)

    vi.mocked(prisma.message.create).mockResolvedValue({ id: 'msg-1', conversationId: 'conv-1' } as any)

    // Simulate Bot Engine replying: when tryRunBotFlows is called, it calls sendMessengerMessage
    vi.mocked(tryRunBotFlows).mockImplementation(async (wsId, chId, conv: any, content) => {
      const config = (conv.channel?.config || { pageAccessToken: 'token-123' }) as any
      await sendMessengerMessage(config.pageAccessToken, conv.contact?.phone || 'user-123', 'Bot Reply: ' + content)
    })

    // 2. Trigger Webhook
    const webhookBody = {
      object: 'page',
      entry: [{
        id: 'page-123',
        messaging: [{
          sender: { id: 'user-123' },
          recipient: { id: 'page-123' },
          timestamp: Date.now(),
          message: { mid: 'mid-123', text: 'Hello Bot!' }
        }]
      }]
    }

    await parseMessengerUpdate(WORKSPACE_ID, CHANNEL_ID, webhookBody)

    // 3. Verifications
    // Verify message was stored
    expect(prisma.message.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        content: 'Hello Bot!',
        externalId: 'mid-123'
      })
    }))

    // Verify Bot Engine was triggered
    expect(tryRunBotFlows).toHaveBeenCalledWith(
      WORKSPACE_ID,
      CHANNEL_ID,
      expect.objectContaining({ id: 'conv-1' }),
      'Hello Bot!'
    )

    // Verify Reply was sent
    expect(sendMessengerMessage).toHaveBeenCalledWith(
      'token-123',
      'user-123',
      'Bot Reply: Hello Bot!'
    )
  })
})
