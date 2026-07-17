import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'crypto'

vi.mock('../message.service', () => ({
  processInboundMessage: vi.fn().mockResolvedValue({ conversationId: 'c1', messageId: 'm1', contactId: 'ct1', isNewConversation: false })
}))

vi.mock('../../ai-agent/providers/gemini.provider', () => ({
  transcribeAudio: vi.fn(async () => 'hola necesito cotizar')
}))

import { verifyWhatsAppSignature, parseWhatsAppUpdate } from '../channels/whatsapp.service'
import { processInboundMessage } from '../message.service'
import { transcribeAudio } from '../../ai-agent/providers/gemini.provider'

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
    const body = '{"test":1}'
    const validSig = makeSignature(body)
    // Same length as real signature but wrong value — exercises timingSafeEqual false path
    const wrongSig = validSig.slice(0, -1) + (validSig.endsWith('a') ? 'b' : 'a')
    expect(verifyWhatsAppSignature(body, wrongSig, APP_SECRET)).toBe(false)
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

    // objectContaining so the assertion tolerates extra fields the parser passes
    // through (e.g. metadata) without becoming brittle.
    expect(processInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        channelId: 'ch-1',
        externalConversationId: '56912345678',
        externalMessageId: 'wamid.123',
        senderExternalId: '56912345678',
        senderName: 'Juan Perez',
        content: 'Hola'
      })
    )
  })

  it('skips non-message webhooks silently', async () => {
    const body = { entry: [{ changes: [{ value: { statuses: [{ id: '1', status: 'delivered' }] } }] }] }
    await parseWhatsAppUpdate('ws-1', 'ch-1', body)
    expect(processInboundMessage).not.toHaveBeenCalled()
  })
})

const CREDS = { accessToken: 'test-token', phoneNumberId: 'pn-1' }

describe('parseWhatsAppUpdate — audio messages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn(async (url: string) => {
      if (String(url).endsWith('/media-id-1')) {
        return { ok: true, json: async () => ({ url: 'https://graph-media/file', mime_type: 'audio/ogg' }) } as any
      }
      if (String(url) === 'https://graph-media/file') {
        return { ok: true, arrayBuffer: async () => new TextEncoder().encode('fake-audio-bytes').buffer } as any
      }
      return { ok: true, json: async () => ({}) } as any
    }) as any
  })

  function audioBody() {
    return {
      entry: [{
        changes: [{
          value: {
            messaging_product: 'whatsapp',
            contacts: [{ profile: { name: 'Ana' }, wa_id: '56911112222' }],
            messages: [{
              id: 'wamid.audio1',
              from: '56911112222',
              timestamp: '1700000000',
              type: 'audio',
              audio: { id: 'media-id-1', mime_type: 'audio/ogg' }
            }]
          }
        }]
      }]
    }
  }

  it('downloads, transcribes, and processes an inbound audio message', async () => {
    await parseWhatsAppUpdate('ws-1', 'ch-1', audioBody() as any, CREDS)

    expect(transcribeAudio).toHaveBeenCalledWith(expect.any(String), 'audio/ogg')
    expect(processInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        channelId: 'ch-1',
        externalConversationId: '56911112222',
        content: 'hola necesito cotizar',
        mediaType: 'audio'
      })
    )
  })

  it('skips the audio message without crashing when no credentials are configured', async () => {
    await parseWhatsAppUpdate('ws-1', 'ch-1', audioBody() as any)

    expect(transcribeAudio).not.toHaveBeenCalled()
    expect(processInboundMessage).not.toHaveBeenCalled()
  })
})
