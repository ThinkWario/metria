import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'crypto'

vi.mock('../message.service', () => ({
  processInboundMessage: vi.fn().mockResolvedValue({ conversationId: 'c1', messageId: 'm1', contactId: 'ct1', isNewConversation: false })
}))

import { verifyInstagramSignature, parseInstagramUpdate } from '../channels/instagram.service'
import { processInboundMessage } from '../message.service'

const APP_SECRET = 'ig-secret'

function makeSig(body: string) {
  return 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(body).digest('hex')
}

describe('verifyInstagramSignature', () => {
  it('returns true on valid signature', () => {
    const body = '{"test":1}'
    expect(verifyInstagramSignature(body, makeSig(body), APP_SECRET)).toBe(true)
  })

  it('returns false on invalid value (same length, wrong hash)', () => {
    const body = '{"test":1}'
    const validSig = makeSig(body)
    // Flip last char to produce wrong-value same-length signature
    const wrongSig = validSig.slice(0, -1) + (validSig.endsWith('a') ? 'b' : 'a')
    expect(verifyInstagramSignature(body, wrongSig, APP_SECRET)).toBe(false)
  })

  it('returns false on missing header', () => {
    expect(verifyInstagramSignature('{}', '', APP_SECRET)).toBe(false)
  })

  it('returns false on wrong-length header', () => {
    expect(verifyInstagramSignature('{}', 'sha256=tooshort', APP_SECRET)).toBe(false)
  })
})

describe('parseInstagramUpdate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls processInboundMessage for a DM text event with ig_ prefix', async () => {
    const body = {
      object: 'instagram',
      entry: [{
        id: 'page-123',
        messaging: [{
          sender: { id: 'ig-user-456' },
          recipient: { id: 'page-123' },
          timestamp: 1700000000,
          message: { mid: 'mid.abc123', text: 'Hola desde IG' }
        }]
      }]
    }

    await parseInstagramUpdate('ws-1', 'ch-ig', body)

    expect(processInboundMessage).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      channelId: 'ch-ig',
      externalConversationId: 'ig-user-456',
      externalMessageId: 'mid.abc123',
      senderExternalId: 'ig_ig-user-456',
      senderName: undefined,
      content: 'Hola desde IG',
      mediaUrl: undefined,
      mediaType: undefined
    })
  })

  it('skips echo messages (is_echo: true)', async () => {
    const body = {
      object: 'instagram',
      entry: [{
        id: 'page-123',
        messaging: [{
          sender: { id: 'page-123' },
          recipient: { id: 'ig-user-456' },
          timestamp: 1700000000,
          message: { mid: 'mid.echo', text: 'echo', is_echo: true }
        }]
      }]
    }

    await parseInstagramUpdate('ws-1', 'ch-ig', body)
    expect(processInboundMessage).not.toHaveBeenCalled()
  })
})
