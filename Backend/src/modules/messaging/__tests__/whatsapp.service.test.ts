import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import crypto from 'crypto'

vi.mock('../message.service', () => ({
  processInboundMessage: vi.fn().mockResolvedValue({ conversationId: 'c1', messageId: 'm1', contactId: 'ct1', isNewConversation: false })
}))

vi.mock('../../ai-agent/providers/gemini.provider', () => ({
  transcribeAudio: vi.fn(async () => 'hola necesito cotizar')
}))

vi.mock('../../../lib/prisma', () => ({
  prisma: { workspace: { findUnique: vi.fn() }, appointment: { findFirst: vi.fn() } }
}))
vi.mock('../../scheduling/scheduling.service', () => ({
  updateAppointmentStatus: vi.fn(async () => ({}))
}))

import { verifyWhatsAppSignature, parseWhatsAppUpdate, sendWhatsAppTemplateMessage } from '../channels/whatsapp.service'
import { processInboundMessage } from '../message.service'
import { transcribeAudio } from '../../ai-agent/providers/gemini.provider'
import { prisma } from '../../../lib/prisma'
import { updateAppointmentStatus } from '../../scheduling/scheduling.service'

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

describe('sendWhatsAppTemplateMessage — botones de respuesta rápida', () => {
  const originalFetch = global.fetch
  afterEach(() => { global.fetch = originalFetch })

  it('incluye los componentes de botón cuando se pasan buttonPayloads', async () => {
    let capturedBody: any
    global.fetch = vi.fn(async (_url: string, init: any) => {
      capturedBody = JSON.parse(init.body)
      return { ok: true, json: async () => ({}) } as any
    }) as any

    await sendWhatsAppTemplateMessage(
      'phone-id', 'token', '56900001111', 'visit_confirmation', 'es',
      ['Roberto'], ['confirm_visit:appt-1:yes', 'confirm_visit:appt-1:no']
    )

    expect(capturedBody.template.components).toEqual([
      { type: 'body', parameters: [{ type: 'text', text: 'Roberto' }] },
      { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: 'confirm_visit:appt-1:yes' }] },
      { type: 'button', sub_type: 'quick_reply', index: '1', parameters: [{ type: 'payload', payload: 'confirm_visit:appt-1:no' }] }
    ])
  })

  it('sin buttonPayloads se comporta igual que antes (solo el componente body)', async () => {
    let capturedBody: any
    global.fetch = vi.fn(async (_url: string, init: any) => {
      capturedBody = JSON.parse(init.body)
      return { ok: true, json: async () => ({}) } as any
    }) as any

    await sendWhatsAppTemplateMessage('phone-id', 'token', '56900001111', 'saludo', 'es', ['Roberto'])

    expect(capturedBody.template.components).toEqual([
      { type: 'body', parameters: [{ type: 'text', text: 'Roberto' }] }
    ])
  })
})

describe('parseWhatsAppUpdate — respuesta de confirmación de visita', () => {
  beforeEach(() => vi.clearAllMocks())

  function buildInteractiveBody(from: string, buttonId: string) {
    return {
      entry: [{ changes: [{ value: {
        messages: [{ id: 'wamid.1', from, type: 'interactive', interactive: { button_reply: { id: buttonId, title: 'x' } } }]
      } }] }]
    } as any
  }

  it('marca la cita COMPLETED cuando el técnico responde "yes" desde notifyPhone', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ notifyPhone: '56900001111' } as any)

    await parseWhatsAppUpdate('ws-1', 'ch-1', buildInteractiveBody('56900001111', 'confirm_visit:appt-1:yes'))

    expect(updateAppointmentStatus).toHaveBeenCalledWith('ws-1', 'appt-1', 'COMPLETED')
  })

  it('marca la cita NO_SHOW cuando el técnico responde "no"', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ notifyPhone: '56900001111' } as any)

    await parseWhatsAppUpdate('ws-1', 'ch-1', buildInteractiveBody('56900001111', 'confirm_visit:appt-1:no'))

    expect(updateAppointmentStatus).toHaveBeenCalledWith('ws-1', 'appt-1', 'NO_SHOW')
  })

  it('ignora el botón si el remitente no es el notifyPhone del workspace', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ notifyPhone: '56900001111' } as any)

    await parseWhatsAppUpdate('ws-1', 'ch-1', buildInteractiveBody('56999998888', 'confirm_visit:appt-1:yes'))

    expect(updateAppointmentStatus).not.toHaveBeenCalled()
  })

  it('acepta el botón desde cualquiera de los números en un notifyPhone con varios separados por coma', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ notifyPhone: '56900001111,56922223333' } as any)

    await parseWhatsAppUpdate('ws-1', 'ch-1', buildInteractiveBody('56922223333', 'confirm_visit:appt-1:yes'))

    expect(updateAppointmentStatus).toHaveBeenCalledWith('ws-1', 'appt-1', 'COMPLETED')
  })
})

describe('parseWhatsAppUpdate — confirmación de visita por texto libre (sin botones)', () => {
  beforeEach(() => vi.clearAllMocks())

  function buildTextBody(from: string, text: string) {
    return {
      entry: [{ changes: [{ value: {
        messages: [{ id: 'wamid.1', from, type: 'text', text: { body: text } }]
      } }] }]
    } as any
  }

  it('marca la cita COMPLETED cuando el técnico responde "sí" en texto libre desde notifyPhone', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ notifyPhone: '56900001111' } as any)
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue({ id: 'appt-1' } as any)

    await parseWhatsAppUpdate('ws-1', 'ch-1', buildTextBody('56900001111', 'Sí'))

    expect(updateAppointmentStatus).toHaveBeenCalledWith('ws-1', 'appt-1', 'COMPLETED')
    expect(processInboundMessage).not.toHaveBeenCalled()
  })

  it('marca la cita NO_SHOW cuando responde "no", tolerando mayúsculas/puntuación', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ notifyPhone: '56900001111' } as any)
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue({ id: 'appt-1' } as any)

    await parseWhatsAppUpdate('ws-1', 'ch-1', buildTextBody('56900001111', 'No.'))

    expect(updateAppointmentStatus).toHaveBeenCalledWith('ws-1', 'appt-1', 'NO_SHOW')
    expect(processInboundMessage).not.toHaveBeenCalled()
  })

  it('reconoce "si" sin tilde y con espacios', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ notifyPhone: '56900001111' } as any)
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue({ id: 'appt-2' } as any)

    await parseWhatsAppUpdate('ws-1', 'ch-1', buildTextBody('56900001111', '  si  '))

    expect(updateAppointmentStatus).toHaveBeenCalledWith('ws-1', 'appt-2', 'COMPLETED')
  })

  it('cae al procesamiento normal si no hay ninguna cita pendiente de confirmación', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ notifyPhone: '56900001111' } as any)
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue(null)

    await parseWhatsAppUpdate('ws-1', 'ch-1', buildTextBody('56900001111', 'si'))

    expect(updateAppointmentStatus).not.toHaveBeenCalled()
    expect(processInboundMessage).toHaveBeenCalled()
  })

  it('cae al procesamiento normal si el texto no es sí/no, aunque venga de notifyPhone', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ notifyPhone: '56900001111' } as any)

    await parseWhatsAppUpdate('ws-1', 'ch-1', buildTextBody('56900001111', 'hola, cómo va todo'))

    expect(updateAppointmentStatus).not.toHaveBeenCalled()
    expect(prisma.appointment.findFirst).not.toHaveBeenCalled()
    expect(processInboundMessage).toHaveBeenCalled()
  })

  it('no intercepta texto de un número que no es el notifyPhone del workspace', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ notifyPhone: '56900001111' } as any)

    await parseWhatsAppUpdate('ws-1', 'ch-1', buildTextBody('56999998888', 'si'))

    expect(updateAppointmentStatus).not.toHaveBeenCalled()
    expect(processInboundMessage).toHaveBeenCalled()
  })

  it('reconoce texto libre desde cualquiera de los números en un notifyPhone con varios separados por coma', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ notifyPhone: '56900001111,56922223333' } as any)
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue({ id: 'appt-1' } as any)

    await parseWhatsAppUpdate('ws-1', 'ch-1', buildTextBody('56922223333', 'si'))

    expect(updateAppointmentStatus).toHaveBeenCalledWith('ws-1', 'appt-1', 'COMPLETED')
  })
})
