import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'crypto'

vi.mock('../message.service', () => ({
  processInboundMessage: vi.fn().mockResolvedValue({ conversationId: 'c1', messageId: 'm1', contactId: 'ct1', isNewConversation: false })
}))

import { verifyWhatsAppSignature, parseWhatsAppUpdate } from '../channels/whatsapp.service'
import { processInboundMessage } from '../message.service'

const APP_SECRET = 'test-secret'

function makeSignature(body: string) {
  return 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(body).digest('hex')
}

describe('verifyWhatsAppSignature', () => {
  it('returns true when signature matches', () => {
    const body = '{"test":1}'
    const sig = makeSignature(body)
    expect(verifyWhatsAppSignature(body, sig, APP_SECRET)).toBe(true)
  })

  it('returns false when signature does not match', () => {
    expect(verifyWhatsAppSignature('{"test":1}', 'sha256=bad', APP_SECRET)).toBe(false)
  })

  it('returns false when signature header is missing', () => {
    expect(verifyWhatsAppSignature('{}', '', APP_SECRET)).toBe(false)
  })
})

describe('parseWhatsAppUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls processInboundMessage for a text message', async () => {
    const body = {
      entry: [{
        changes: [{
          value: {
            messaging_product: 'whatsapp',
            contacts: [{ profile: { name: 'Juan Perez' }, wa_id: '56912345678' }],
            messages: [{
              id: 'wamid.123',
              from: '56912345678',
              timestamp: '1700000000',
              type: 'text',
              text: { body: 'Hola' }
            }]
          }
        }]
      }]
    }

    await parseWhatsAppUpdate('ws-1', 'ch-1', body)

    expect(processInboundMessage).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      channelId: 'ch-1',
      externalConversationId: '56912345678',
      externalMessageId: 'wamid.123',
      senderExternalId: '56912345678',
      senderName: 'Juan Perez',
      content: 'Hola',
      mediaUrl: undefined,
      mediaType: undefined
    })
  })

  it('skips non-message webhooks silently', async () => {
    const body = { entry: [{ changes: [{ value: { statuses: [{ id: '1', status: 'delivered' }] } }] }] }
    await parseWhatsAppUpdate('ws-1', 'ch-1', body)
    expect(processInboundMessage).not.toHaveBeenCalled()
  })
})
