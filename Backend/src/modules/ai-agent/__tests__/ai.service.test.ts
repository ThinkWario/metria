import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    conversation: { findUnique: vi.fn(), update: vi.fn() },
    botAgent: { findFirst: vi.fn() },
    product: { findMany: vi.fn(async () => []) },
    deal: { findFirst: vi.fn(async () => null), update: vi.fn() },
    pipeline: { findFirst: vi.fn() },
    pipelineStage: { findMany: vi.fn(), findFirst: vi.fn() },
    message: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    contact: { findUnique: vi.fn(async () => ({ name: 'Ana', email: null })) },
    appointment: { findFirst: vi.fn() }
  }
}))
const { syncAppointmentToCalendarMock, updateCalendarEventMock, notifyAppointmentEventMock, formatApptDateTimeMock } = vi.hoisted(() => ({
  syncAppointmentToCalendarMock: vi.fn(async () => {}),
  updateCalendarEventMock: vi.fn(async () => {}),
  notifyAppointmentEventMock: vi.fn(async () => {}),
  formatApptDateTimeMock: vi.fn((d: Date) => `formatted:${d.toISOString()}`)
}))
vi.mock('../../scheduling/google-calendar.service', () => ({
  syncAppointmentToCalendar: syncAppointmentToCalendarMock,
  updateCalendarEvent: updateCalendarEventMock
}))
vi.mock('../../scheduling/appointment-notifications.service', () => ({
  notifyAppointmentEvent: notifyAppointmentEventMock,
  formatApptDateTime: formatApptDateTimeMock
}))
const chatMock = vi.fn()
const extractMock = vi.fn()
vi.mock('../providers/provider.factory', () => ({
  getProvider: vi.fn(() => ({ chat: chatMock, embed: vi.fn(async () => [[0.1]]), extract: extractMock }))
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
  filterSlotsByCalendarBusy: vi.fn(async (_ws, _type, slots) => slots),
  scheduleAppointment: vi.fn(async () => ({ id: 'a1', scheduledAt: new Date('2026-06-15T10:00:00') })),
  rescheduleAppointment: vi.fn(async () => ({
    id: 'a1', type: 'SITE_VISIT', scheduledAt: new Date('2026-06-16T10:00:00'),
    durationMin: 60, googleEventId: null, oldScheduledAt: new Date('2026-06-15T10:00:00')
  })),
  getWorkspaceTimezone: vi.fn(async () => 'America/Santiago')
}))
vi.mock('../../crm/pipeline.service', () => ({ createDeal: vi.fn(), moveDeal: vi.fn() }))

import { processAiResponse } from '../ai.service'
import { prisma } from '../../../lib/prisma'
import { updateQualification, addTag } from '../../crm/contact.service'
import { scheduleAppointment, getAvailableSlots, filterSlotsByCalendarBusy, rescheduleAppointment } from '../../scheduling/scheduling.service'

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

  it('grounds the system prompt with the contact\'s active appointment so the bot does not re-offer scheduling', async () => {
    const scheduledAt = new Date('2026-06-15T17:00:00')
    vi.mocked(prisma.appointment.findFirst).mockResolvedValueOnce({ id: 'a1', type: 'SITE_VISIT', scheduledAt } as any)
    chatMock.mockResolvedValue({ text: 'Sí, tu visita sigue para esa fecha.', toolCalls: [], submitToolResults: vi.fn() })

    await processAiResponse(WS, CONV, '¿sigue mi cita?')

    const system = chatMock.mock.calls[0][0].system
    expect(system).toContain('CITA AGENDADA')
    expect(system).toContain(`formatted:${scheduledAt.toISOString()}`)
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

  it('executes schedule_appointment tool and syncs the booking to Google Calendar', async () => {
    const submit = vi.fn(async () => ({ text: 'Agendado', toolCalls: [], submitToolResults: vi.fn() }))
    chatMock.mockResolvedValue({
      text: null,
      toolCalls: [{ name: 'schedule_appointment', args: { contactId: 'c1', isoDateTime: '2026-06-15T10:00:00', type: 'SITE_VISIT' } }],
      submitToolResults: submit
    })
    const result = await processAiResponse(WS, CONV, 'el lunes a las 10')
    expect(scheduleAppointment).toHaveBeenCalled()
    expect(syncAppointmentToCalendarMock).toHaveBeenCalledWith(WS, 'a1', expect.objectContaining({ bookerName: 'Ana' }))
    expect(submit).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'schedule_appointment',
        response: expect.objectContaining({ success: true, label: expect.stringMatching(/^formatted:/) })
      })
    ])
    expect(result).toBe('Agendado')
  })

  it('reschedules the existing active appointment instead of creating a duplicate when the contact already has one', async () => {
    // Two calls: one grounding the system prompt, one from schedule_appointment's own existing-active check.
    const existing = { id: 'existing-1', type: 'SITE_VISIT', status: 'SCHEDULED', scheduledAt: new Date('2026-06-10T10:00:00') }
    vi.mocked(prisma.appointment.findFirst).mockResolvedValueOnce(existing as any).mockResolvedValueOnce(existing as any)
    const submit = vi.fn(async () => ({ text: 'Reagendado', toolCalls: [], submitToolResults: vi.fn() }))
    chatMock.mockResolvedValue({
      text: null,
      toolCalls: [{ name: 'schedule_appointment', args: { contactId: 'c1', isoDateTime: '2026-06-15T10:00:00', type: 'SITE_VISIT' } }],
      submitToolResults: submit
    })
    await processAiResponse(WS, CONV, 'esto no ocurrió, agendemos de nuevo')
    expect(rescheduleAppointment).toHaveBeenCalledWith(WS, 'existing-1', new Date('2026-06-15T10:00:00'))
    expect(scheduleAppointment).not.toHaveBeenCalled()
    // Rescheduling already updates the existing Calendar event — must not create a second one.
    expect(syncAppointmentToCalendarMock).not.toHaveBeenCalled()
    expect(notifyAppointmentEventMock).toHaveBeenCalledWith(WS, expect.objectContaining({ kind: 'rescheduled' }))
    expect(submit).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'schedule_appointment', response: expect.objectContaining({ success: true }) })
    ])
  })

  it('still reports the booking as successful when the post-booking Calendar sync throws', async () => {
    vi.mocked(prisma.contact.findUnique).mockRejectedValueOnce(new Error('db down'))
    const submit = vi.fn(async () => ({ text: 'Agendado', toolCalls: [], submitToolResults: vi.fn() }))
    chatMock.mockResolvedValue({
      text: null,
      toolCalls: [{ name: 'schedule_appointment', args: { contactId: 'c1', isoDateTime: '2026-06-15T10:00:00', type: 'SITE_VISIT' } }],
      submitToolResults: submit
    })
    await processAiResponse(WS, CONV, 'el lunes a las 10')
    expect(submit).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'schedule_appointment', response: expect.objectContaining({ success: true }) })
    ])
  })

  it('executes get_available_slots and filters out slots busy on the connected Google Calendar', async () => {
    const submit = vi.fn(async () => ({ text: 'Estos horarios tengo libres', toolCalls: [], submitToolResults: vi.fn() }))
    chatMock.mockResolvedValue({
      text: null,
      toolCalls: [{ name: 'get_available_slots', args: { type: 'SITE_VISIT' } }],
      submitToolResults: submit
    })
    vi.mocked(filterSlotsByCalendarBusy).mockResolvedValueOnce([])

    await processAiResponse(WS, CONV, '¿qué horarios hay?')
    expect(filterSlotsByCalendarBusy).toHaveBeenCalledWith(WS, 'SITE_VISIT', [new Date('2026-06-15T10:00:00')])
    expect(submit).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'get_available_slots', response: { slots: [] } })
    ])
  })

  it('returns each slot as {isoDateTime, label} instead of a bare string — the model must never reformat isoDateTime itself', async () => {
    const slotDate = new Date('2026-06-15T10:00:00')
    vi.mocked(filterSlotsByCalendarBusy).mockResolvedValueOnce([slotDate])
    const submit = vi.fn(async () => ({ text: 'Estos horarios tengo libres', toolCalls: [], submitToolResults: vi.fn() }))
    chatMock.mockResolvedValue({
      text: null,
      toolCalls: [{ name: 'get_available_slots', args: { type: 'SITE_VISIT' } }],
      submitToolResults: submit
    })

    await processAiResponse(WS, CONV, '¿qué horarios hay?')

    expect(submit).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'get_available_slots',
        response: { slots: [{ isoDateTime: slotDate.toISOString(), label: `formatted:${slotDate.toISOString()}` }] }
      })
    ])
  })

  it('notifies on schedule_appointment (new booking)', async () => {
    const submit = vi.fn(async () => ({ text: 'Agendado', toolCalls: [], submitToolResults: vi.fn() }))
    chatMock.mockResolvedValue({
      text: null,
      toolCalls: [{ name: 'schedule_appointment', args: { contactId: 'c1', isoDateTime: '2026-06-15T10:00:00', type: 'SITE_VISIT' } }],
      submitToolResults: submit
    })

    await processAiResponse(WS, CONV, 'el lunes a las 10')

    expect(notifyAppointmentEventMock).toHaveBeenCalledWith(WS, expect.objectContaining({ kind: 'created', conversationId: CONV }))
  })

  it('executes reschedule_appointment: updates the active appointment and notifies both sides', async () => {
    // Two calls: one grounding the system prompt, one from reschedule_appointment's own lookup.
    const active = { id: 'a1', type: 'SITE_VISIT', scheduledAt: new Date('2026-06-10T10:00:00') }
    vi.mocked(prisma.appointment.findFirst).mockResolvedValueOnce(active as any).mockResolvedValueOnce(active as any)
    vi.mocked(getAvailableSlots).mockResolvedValueOnce([new Date('2026-06-16T10:00:00')])
    const submit = vi.fn(async () => ({ text: 'Reagendado', toolCalls: [], submitToolResults: vi.fn() }))
    chatMock.mockResolvedValue({
      text: null,
      toolCalls: [{ name: 'reschedule_appointment', args: { newIsoDateTime: '2026-06-16T10:00:00' } }],
      submitToolResults: submit
    })

    const result = await processAiResponse(WS, CONV, 'mejor el martes a las 10')

    expect(rescheduleAppointment).toHaveBeenCalledWith(WS, 'a1', new Date('2026-06-16T10:00:00'))
    expect(notifyAppointmentEventMock).toHaveBeenCalledWith(WS, expect.objectContaining({ kind: 'rescheduled', conversationId: CONV }))
    expect(submit).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'reschedule_appointment',
        response: expect.objectContaining({ success: true, label: expect.stringMatching(/^formatted:/) })
      })
    ])
    expect(result).toBe('Reagendado')
  })

  it('reschedule_appointment returns an error when the contact has no active appointment', async () => {
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue(null)
    const submit = vi.fn(async () => ({ text: 'No encontré tu cita', toolCalls: [], submitToolResults: vi.fn() }))
    chatMock.mockResolvedValue({
      text: null,
      toolCalls: [{ name: 'reschedule_appointment', args: { newIsoDateTime: '2026-06-16T10:00:00' } }],
      submitToolResults: submit
    })

    await processAiResponse(WS, CONV, 'quiero cambiar mi hora')

    expect(submit).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'reschedule_appointment', response: { success: false, error: 'No hay cita activa para reagendar' } })
    ])
  })

  it('fetches the LATEST messages and sends history chronologically without duplicating the inbound turn', async () => {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
      id: CONV, workspaceId: WS, isHandledByBot: true,
      contact: { id: 'c1', name: 'Ana', status: 'LEAD', leadTemperature: null, leadType: null, leadScore: null, qualificationData: null },
      // newest-first, as returned by orderBy: { sentAt: 'desc' } — includes the just-persisted inbound
      messages: [
        { senderType: 'CONTACT', content: 'Quiero cotizar', isInternal: false },
        { senderType: 'BOT', content: '¿En qué te ayudo?', isInternal: false },
        { senderType: 'CONTACT', content: 'Hola', isInternal: false }
      ],
      channel: { platform: 'WHATSAPP' }
    } as any)
    chatMock.mockResolvedValue({ text: 'ok', toolCalls: [], submitToolResults: vi.fn() })

    await processAiResponse(WS, CONV, 'Quiero cotizar')

    // query asks for the latest messages, not the oldest
    expect(prisma.conversation.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({ messages: { orderBy: { sentAt: 'desc' }, take: 10 } })
      })
    )
    // chronological order, inbound message appears exactly once (as the final user turn)
    expect(chatMock.mock.calls[0][0].messages).toEqual([
      { role: 'user', content: 'Hola' },
      { role: 'assistant', content: '¿En qué te ayudo?' },
      { role: 'user', content: 'Quiero cotizar' }
    ])
  })

  it('returns null when conversation not handled by bot', async () => {
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({ id: CONV, isHandledByBot: false } as any)
    expect(await processAiResponse(WS, CONV, 'x')).toBeNull()
  })

  it('applies the agent profile languageGuard to the final response', async () => {
    vi.mocked(prisma.botAgent.findFirst).mockResolvedValue({
      id: 'bot-1', name: 'Sol', tone: 'casual', promptBase: null, provider: 'gemini',
      config: { profile: { languageGuard: { stripMarkdownEmphasis: true } } }
    } as any)
    chatMock.mockResolvedValue({ text: '¡Hola *Ana*!', toolCalls: [], submitToolResults: vi.fn() })

    const result = await processAiResponse(WS, CONV, 'Hola')

    expect(result).toBe('¡Hola Ana!')
  })

  it('blocks a hallucinated URL that no tool call returned this turn', async () => {
    chatMock.mockResolvedValue({
      text: 'Aquí tienes tu link de pago: https://fake-pay.example.com/xyz',
      toolCalls: [],
      submitToolResults: vi.fn()
    })

    const result = await processAiResponse(WS, CONV, 'Hola')

    expect(result).not.toContain('https://')
  })

  it('uses the legacy single-call path by default (AI_QUALIFIER_SPLIT_ENABLED unset)', async () => {
    chatMock.mockResolvedValue({ text: '¡Hola Ana!', toolCalls: [], submitToolResults: vi.fn() })
    const result = await processAiResponse(WS, CONV, 'Hola')
    expect(result).toBe('¡Hola Ana!')
    // legacy path declares the full 10-tool set (qualifier + responder tools together)
    expect(chatMock.mock.calls[0][0].tools).toHaveLength(10)
  })
})

describe('processAiResponse (split path — AI_QUALIFIER_SPLIT_ENABLED=true)', () => {
  beforeEach(() => {
    process.env.AI_QUALIFIER_SPLIT_ENABLED = 'true'
  })

  afterEach(() => {
    delete process.env.AI_QUALIFIER_SPLIT_ENABLED
  })

  it('applies the qualifier JSON output as CRM writes and returns the sanitized responder text', async () => {
    extractMock.mockResolvedValue({ qualification: { temperature: 'HOT', type: 'READY_TO_BUY', score: 90 } })
    chatMock.mockResolvedValue({ text: 'Perfecto, avancemos.', toolCalls: [], submitToolResults: vi.fn() })

    const result = await processAiResponse(WS, CONV, 'Quiero comprar ya')

    expect(updateQualification).toHaveBeenCalledWith(WS, 'c1', expect.objectContaining({ temperature: 'HOT' }))
    expect(result).toBe('Perfecto, avancemos.')
    // responder only ever sees the 4 scoped tools, not the full 10
    expect(chatMock.mock.calls[0][0].tools.map((t: any) => t.name)).toEqual(['search_catalog', 'get_available_slots', 'schedule_appointment', 'reschedule_appointment'])
  })

  it('logs a partial_apply_failure to AuditLog but keeps the fields that succeeded', async () => {
    extractMock.mockResolvedValue({ qualification: { temperature: 'WARM' }, tags: ['lead-caliente'] })
    vi.mocked(addTag).mockRejectedValueOnce(new Error('duplicate tag'))
    chatMock.mockResolvedValue({ text: 'ok', toolCalls: [], submitToolResults: vi.fn() })

    await processAiResponse(WS, CONV, 'x')

    expect(updateQualification).toHaveBeenCalled()
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ event: 'partial_apply_failure', status: 'error' })
    }))
  })

  it('logs extract_failed and still returns the responder text when the qualifier call fails', async () => {
    extractMock.mockResolvedValue(null)
    chatMock.mockResolvedValue({ text: 'Aquí tienes la info.', toolCalls: [], submitToolResults: vi.fn() })

    const result = await processAiResponse(WS, CONV, 'x')

    expect(result).toBe('Aquí tienes la info.')
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ event: 'extract_failed', status: 'error' })
    }))
  })

  it('discards the responder text and hands over when the qualifier sets needsHuman', async () => {
    extractMock.mockResolvedValue({ needsHuman: { value: true, reason: 'Cliente molesto' } })
    chatMock.mockResolvedValue({ text: 'Este texto nunca debe salir.', toolCalls: [], submitToolResults: vi.fn() })

    const result = await processAiResponse(WS, CONV, 'x')

    expect(result).toBeNull()
    expect(prisma.conversation.update).toHaveBeenCalledWith({ where: { id: CONV }, data: { isHandledByBot: false } })
  })

  it('blocks a leaked internal trace via codeLeakGuard before it reaches the customer', async () => {
    extractMock.mockResolvedValue(null)
    chatMock.mockResolvedValue({
      text: 'tool_code\nprint(default_api.update_qualification(...))\nthought\nEl usuario quiere...',
      toolCalls: [],
      submitToolResults: vi.fn()
    })

    const result = await processAiResponse(WS, CONV, 'x')

    expect(result).toBe('Dame un segundo, reviso eso y te confirmo.')
  })
})
