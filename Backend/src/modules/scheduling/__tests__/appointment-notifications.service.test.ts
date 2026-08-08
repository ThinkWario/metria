import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    channel: { findFirst: vi.fn() },
    workspace: { findUnique: vi.fn() },
    businessHours: { findUnique: vi.fn() }
  }
}))

vi.mock('../../messaging/message.service', () => ({
  sendPlatformMessage: vi.fn(async () => {}),
  sendOutboundPlatformMessage: vi.fn(async () => {}),
  sendInternalWhatsAppTemplate: vi.fn(async () => {})
}))

import { notifyAppointmentEvent } from '../appointment-notifications.service'
import { prisma } from '../../../lib/prisma'
import { sendPlatformMessage, sendOutboundPlatformMessage, sendInternalWhatsAppTemplate } from '../../messaging/message.service'

const sendPlatformMessageMock = sendPlatformMessage as any
const sendOutboundPlatformMessageMock = sendOutboundPlatformMessage as any
const sendInternalWhatsAppTemplateMock = sendInternalWhatsAppTemplate as any

const WS = 'ws-1'
const CHANNEL = { id: 'ch-1', platform: 'WHATSAPP', config: { phoneNumberId: 'pn-1', accessToken: 'tok' } }
const CONTACT = { id: 'c1', name: 'Ana', phone: '56911112222' }
const APPT = { type: 'SITE_VISIT', scheduledAt: new Date('2026-07-20T14:00:00Z'), durationMin: 60 }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.channel.findFirst).mockResolvedValue(CHANNEL as any)
  vi.mocked(prisma.businessHours.findUnique).mockResolvedValue({ timezone: 'America/Santiago' } as any)
})

describe('notifyAppointmentEvent', () => {
  it('sends both the internal alert and the lead confirmation when notifyPhone is set and a conversation exists', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ notifyPhone: '56999998888' } as any)

    await notifyAppointmentEvent(WS, { contact: CONTACT, appointment: APPT, kind: 'created', conversationId: 'conv-1' })

    expect(sendPlatformMessageMock).toHaveBeenCalledWith('WHATSAPP', CHANNEL.config, '56999998888', expect.stringContaining('Nueva cita'), WS)
    expect(sendOutboundPlatformMessageMock).toHaveBeenCalledWith(WS, 'conv-1', expect.stringContaining('quedó agendada'))
  })

  it('sends the internal alert as a tracked template (visible in the Metria inbox) when a technicalVisitTemplateId is configured for a SITE_VISIT', async () => {
    vi.mocked(prisma.channel.findFirst).mockResolvedValue({
      ...CHANNEL, config: { ...CHANNEL.config, technicalVisitTemplateId: 'tpl-1' }
    } as any)
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ notifyPhone: '56999998888' } as any)

    await notifyAppointmentEvent(WS, { contact: CONTACT, appointment: APPT, kind: 'created', conversationId: 'conv-1' })

    expect(sendInternalWhatsAppTemplateMock).toHaveBeenCalledWith(
      WS, 'ch-1', '56999998888', 'tpl-1', [CONTACT.name, CONTACT.phone, expect.any(String)]
    )
    expect(sendPlatformMessageMock).not.toHaveBeenCalledWith('WHATSAPP', expect.anything(), '56999998888', expect.anything(), WS)
  })

  it('falls back to a plain-text alert (no CRM trace) when there is no technicalVisitTemplateId', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ notifyPhone: '56999998888' } as any)

    await notifyAppointmentEvent(WS, { contact: CONTACT, appointment: APPT, kind: 'created', conversationId: 'conv-1' })

    expect(sendInternalWhatsAppTemplateMock).not.toHaveBeenCalled()
    expect(sendPlatformMessageMock).toHaveBeenCalledWith('WHATSAPP', CHANNEL.config, '56999998888', expect.stringContaining('Nueva cita'), WS)
  })

  it('sends a raw WhatsApp message to the lead when there is no conversation (public booking path)', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ notifyPhone: null } as any)

    await notifyAppointmentEvent(WS, { contact: CONTACT, appointment: APPT, kind: 'created' })

    expect(sendOutboundPlatformMessageMock).not.toHaveBeenCalled()
    expect(sendPlatformMessageMock).toHaveBeenCalledWith('WHATSAPP', CHANNEL.config, CONTACT.phone, expect.stringContaining('quedó agendada'), WS)
  })

  it('skips the internal alert when notifyPhone is not configured', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ notifyPhone: null } as any)

    await notifyAppointmentEvent(WS, { contact: CONTACT, appointment: APPT, kind: 'created', conversationId: 'conv-1' })

    expect(sendPlatformMessageMock).not.toHaveBeenCalled()
    expect(sendOutboundPlatformMessageMock).toHaveBeenCalled()
  })

  it('includes the old time in the rescheduled message text', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ notifyPhone: '56999998888' } as any)
    const oldScheduledAt = new Date('2026-07-19T14:00:00Z')

    await notifyAppointmentEvent(WS, {
      contact: CONTACT, appointment: APPT, kind: 'rescheduled', oldScheduledAt, conversationId: 'conv-1'
    })

    expect(sendPlatformMessageMock).toHaveBeenCalledWith('WHATSAPP', CHANNEL.config, '56999998888', expect.stringContaining('Cita reagendada'), WS)
    expect(sendOutboundPlatformMessageMock).toHaveBeenCalledWith(WS, 'conv-1', expect.stringContaining('reagendada'))
  })

  it('does nothing when the workspace has no WhatsApp channel connected', async () => {
    vi.mocked(prisma.channel.findFirst).mockResolvedValue(null as any)

    await notifyAppointmentEvent(WS, { contact: CONTACT, appointment: APPT, kind: 'created', conversationId: 'conv-1' })

    expect(sendPlatformMessageMock).not.toHaveBeenCalled()
    expect(sendOutboundPlatformMessageMock).not.toHaveBeenCalled()
  })

  it('never throws when the lead confirmation send fails', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ notifyPhone: null } as any)
    sendOutboundPlatformMessageMock.mockRejectedValueOnce(new Error('WhatsApp API down'))

    await expect(
      notifyAppointmentEvent(WS, { contact: CONTACT, appointment: APPT, kind: 'created', conversationId: 'conv-1' })
    ).resolves.toBeUndefined()
  })

  it('skips silently when kind is rescheduled but oldScheduledAt is missing', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ notifyPhone: '56999998888' } as any)

    await notifyAppointmentEvent(WS, { contact: CONTACT, appointment: APPT, kind: 'rescheduled', conversationId: 'conv-1' })

    expect(sendPlatformMessageMock).not.toHaveBeenCalled()
    expect(sendOutboundPlatformMessageMock).not.toHaveBeenCalled()
  })
})
