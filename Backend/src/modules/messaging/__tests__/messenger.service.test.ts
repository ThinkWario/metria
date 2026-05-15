import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import crypto from 'crypto'

vi.mock('../message.service', () => ({
  processInboundMessage: vi.fn().mockResolvedValue({ conversationId: 'c1', messageId: 'm1', contactId: 'ct1', isNewConversation: false })
}))

import { sendMessengerMessage, verifyMessengerSignature, parseMessengerUpdate } from '../channels/messenger.service'
import { processInboundMessage } from '../message.service'

const APP_SECRET = 'msgr-secret'

function makeSig(body: string) {
  return 'sha256=' + crypto.createHmac('sha256', APP_SECRET).update(body).digest('hex')
}

describe('Messenger Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('sendMessengerMessage', () => {
    it('successfully sends a message', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({})
      } as Response)

      await sendMessengerMessage('token-123', 'user-456', 'Hello World')

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('graph.facebook.com'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer token-123'
          }),
          body: JSON.stringify({
            recipient: { id: 'user-456' },
            message: { text: 'Hello World' }
          })
        })
      )
    })

    it('throws error when API response is not ok', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'Bad Request'
      } as Response)

      await expect(sendMessengerMessage('token-123', 'user-456', 'Hello World'))
        .rejects.toThrow('Messenger API error 400: Bad Request')
    })
  })

  describe('verifyMessengerSignature', () => {
    it('returns true on valid signature', () => {
      const body = '{"test":1}'
      expect(verifyMessengerSignature(body, makeSig(body), APP_SECRET)).toBe(true)
    })

    it('returns false on invalid value (same length, wrong hash)', () => {
      const body = '{"test":1}'
      const validSig = makeSig(body)
      const wrongSig = validSig.slice(0, -1) + (validSig.endsWith('a') ? 'b' : 'a')
      expect(verifyMessengerSignature(body, wrongSig, APP_SECRET)).toBe(false)
    })

    it('returns false on missing header', () => {
      expect(verifyMessengerSignature('{}', '', APP_SECRET)).toBe(false)
    })

    it('returns false on wrong-length header', () => {
      expect(verifyMessengerSignature('{}', 'sha256=tooshort', APP_SECRET)).toBe(false)
    })
  })

  describe('parseMessengerUpdate', () => {
    it('calls processInboundMessage for a DM text event with msgr_ prefix', async () => {
      const body = {
        object: 'page',
        entry: [{
          id: 'page-123',
          messaging: [{
            sender: { id: 'msgr-user-456' },
            recipient: { id: 'page-123' },
            timestamp: 1700000000,
            message: { mid: 'mid.abc123', text: 'Hola desde Messenger' }
          }]
        }]
      }

      await parseMessengerUpdate('ws-1', 'ch-msgr', body)

      expect(processInboundMessage).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        channelId: 'ch-msgr',
        externalConversationId: 'msgr-user-456',
        externalMessageId: 'mid.abc123',
        senderExternalId: 'msgr_msgr-user-456',
        senderName: undefined,
        content: 'Hola desde Messenger',
        mediaUrl: undefined,
        mediaType: undefined
      })
    })

    it('skips echo messages (is_echo: true)', async () => {
      const body = {
        object: 'page',
        entry: [{
          id: 'page-123',
          messaging: [{
            sender: { id: 'page-123' },
            recipient: { id: 'msgr-user-456' },
            timestamp: 1700000000,
            message: { mid: 'mid.echo', text: 'echo', is_echo: true }
          }]
        }]
      }

      await parseMessengerUpdate('ws-1', 'ch-msgr', body)
      expect(processInboundMessage).not.toHaveBeenCalled()
    })
  })
})
