import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    conversation: { findUnique: vi.fn(), update: vi.fn() },
    botAgent: { findFirst: vi.fn() },
    product: { findMany: vi.fn(async () => []) },
    deal: { findFirst: vi.fn(async () => null), update: vi.fn() },
    pipeline: { findFirst: vi.fn() },
    pipelineStage: { findMany: vi.fn(), findFirst: vi.fn() },
    message: { create: vi.fn() }
  }
}))
const chatMock = vi.fn()
vi.mock('../providers/provider.factory', () => ({
  getProvider: vi.fn(() => ({ chat: chatMock, embed: vi.fn(async () => [[0.1]]) }))
}))
vi.mock('../../knowledge/retrieval.service', () => ({
  retrieveRelevantChunks: vi.fn(async () => [{ content: 'Garantía 10 años', score: 0.9 }])
}))
vi.mock('../../crm/contact.service', () => ({
  updateContact: vi.fn(),
  updateQualification: vi.fn(),
  addTag: vi.fn()
}))
vi.mock('../../scheduling/scheduling.service', () => ({
  getAvailableSlots: vi.fn(async () => [new Date('2026-06-15T10:00:00')]),
  scheduleAppointment: vi.fn(async () => ({ id: 'a1', scheduledAt: new Date('2026-06-15T10:00:00') }))
}))
vi.mock('../../crm/pipeline.service', () => ({ createDeal: vi.fn() }))

import { processAiResponse } from '../ai.service'
import { prisma } from '../../../lib/prisma'
import { updateQualification, addTag } from '../../crm/contact.service'
import { scheduleAppointment } from '../../scheduling/scheduling.service'

const WS = 'ws-1'
const CONV = 'conv-1'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
    id: CONV, workspaceId: WS, isHandledByBot: true,
    contact: { id: 'c1', name: 'Ana', status: 'LEAD', leadTemperature: null, leadType: null, leadScore: null, qualificationData: null },
    messages: [{ senderType: 'CONTACT', content: 'Hola' }],
    channel: { platform: 'WHATSAPP' }
  } as any)
  vi.mocked(prisma.botAgent.findFirst).mockResolvedValue({
    id: 'bot-1', name: 'Sol', tone: 'casual', promptBase: null, provider: 'gemini', config: { profile: null }
  } as any)
})

describe('processAiResponse (rewired)', () => {
  it('returns plain text response and includes RAG chunks in system prompt', async () => {
    chatMock.mockResolvedValue({ text: '¡Hola Ana!', toolCalls: [], submitToolResults: vi.fn() })
    const result = await processAiResponse(WS, CONV, 'Hola')
    expect(result).toBe('¡Hola Ana!')
    const system = chatMock.mock.calls[0][0].system
    expect(system).toContain('Garantía 10 años')
  })

  it('executes update_qualification tool call and returns final text', async () => {
    const submit = vi.fn(async () => ({ text: 'Listo, te tengo calificada.', toolCalls: [], submitToolResults: vi.fn() }))
    chatMock.mockResolvedValue({
      text: null,
      toolCalls: [{ name: 'update_qualification', args: { contactId: 'c1', temperature: 'HOT', type: 'READY_TO_BUY', score: 85 } }],
      submitToolResults: submit
    })
    const result = await processAiResponse(WS, CONV, 'Quiero comprar ya')
    expect(updateQualification).toHaveBeenCalledWith(WS, 'c1', expect.objectContaining({ temperature: 'HOT' }))
    expect(result).toBe('Listo, te tengo calificada.')
  })

  it('executes tag_contact tool', async () => {
    const submit = vi.fn(async () => ({ text: 'ok', toolCalls: [], submitToolResults: vi.fn() }))
    chatMock.mockResolvedValue({
      text: null,
      toolCalls: [{ name: 'tag_contact', args: { contactId: 'c1', name: 'lead-caliente' } }],
      submitToolResults: submit
    })
    await processAiResponse(WS, CONV, 'x')
    expect(addTag).toHaveBeenCalledWith(WS, 'c1', 'lead-caliente', expect.anything())
  })

  it('executes schedule_appointment tool', async () => {
    const submit = vi.fn(async () => ({ text: 'Agendado', toolCalls: [], submitToolResults: vi.fn() }))
    chatMock.mockResolvedValue({
      text: null,
      toolCalls: [{ name: 'schedule_appointment', args: { contactId: 'c1', isoDateTime: '2026-06-15T10:00:00', type: 'SITE_VISIT' } }],
      submitToolResults: submit
    })
    const result = await processAiResponse(WS, CONV, 'el lunes a las 10')
    expect(scheduleAppointment).toHaveBeenCalled()
    expect(result).toBe('Agendado')
  })

  it('returns null when conversation not handled by bot', async () => {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({ id: CONV, isHandledByBot: false } as any)
    expect(await processAiResponse(WS, CONV, 'x')).toBeNull()
  })
})
