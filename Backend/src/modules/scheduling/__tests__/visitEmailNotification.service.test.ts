import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    workspace: { findUnique: vi.fn() },
    contact: { findUnique: vi.fn() },
    businessHours: { findUnique: vi.fn() }
  }
}))
vi.mock('../gmail.service', () => ({ sendGmailEmail: vi.fn(async () => {}) }))

import { sendVisitEmailNotification } from '../visitEmailNotification.service'
import { prisma } from '../../../lib/prisma'
import { sendGmailEmail } from '../gmail.service'

const WS = 'ws-1'
const CONTACT = { id: 'c1', name: 'Alexis Carvajal', phone: '56942597739' }
const APPT = { type: 'SITE_VISIT', scheduledAt: new Date('2026-08-10T19:00:00Z') }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.businessHours.findUnique).mockResolvedValue({ timezone: 'America/Santiago' } as any)
  vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ visitNotifyEmails: 'ops@drillchile.cl, ventas@drillchile.cl' } as any)
  vi.mocked(prisma.contact.findUnique).mockResolvedValue({
    sessionId: 'sess-123',
    qualificationData: { rawFields: { direccion: 'Inés de Suárez 283, Quilpué', houseMapUrl: 'https://maps.google.com/house', meterMapUrl: 'https://maps.google.com/meter' } }
  } as any)
})

describe('sendVisitEmailNotification', () => {
  it('sends to every configured recipient with the built subject and HTML body', async () => {
    await sendVisitEmailNotification(WS, { contact: CONTACT, appointment: APPT, kind: 'created' })

    expect(sendGmailEmail).toHaveBeenCalledWith(WS, expect.objectContaining({
      to: ['ops@drillchile.cl', 'ventas@drillchile.cl'],
      subject: expect.stringContaining('Alexis Carvajal'),
      html: expect.stringContaining('Alexis Carvajal')
    }))
  })

  it('includes the quote link, address, and both map links in the body', async () => {
    await sendVisitEmailNotification(WS, { contact: CONTACT, appointment: APPT, kind: 'created' })

    const html = vi.mocked(sendGmailEmail).mock.calls[0][1].html
    expect(html).toContain('https://solar.drillchile.cl/cotizaciones?sessionId=sess-123')
    expect(html).toContain('Inés de Suárez 283, Quilpué')
    expect(html).toContain('https://maps.google.com/house')
    expect(html).toContain('https://maps.google.com/meter')
  })

  it('includes the previous date/time for a reschedule', async () => {
    const oldScheduledAt = new Date('2026-08-09T19:00:00Z')
    await sendVisitEmailNotification(WS, { contact: CONTACT, appointment: APPT, kind: 'rescheduled', oldScheduledAt })

    const html = vi.mocked(sendGmailEmail).mock.calls[0][1].html
    expect(html).toContain('Anteriormente')
  })

  it('omits the quote section when the contact has no sessionId', async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue({ sessionId: null, qualificationData: null } as any)

    await sendVisitEmailNotification(WS, { contact: CONTACT, appointment: APPT, kind: 'created' })

    const html = vi.mocked(sendGmailEmail).mock.calls[0][1].html
    expect(html).not.toContain('cotizaciones?sessionId')
  })

  it('includes the Carta de intención download link, pointing at BACKEND_URL', async () => {
    const previous = process.env.BACKEND_URL
    process.env.BACKEND_URL = 'https://backend.example.com'
    try {
      await sendVisitEmailNotification(WS, { contact: CONTACT, appointment: APPT, kind: 'created' })

      const html = vi.mocked(sendGmailEmail).mock.calls[0][1].html
      expect(html).toContain('https://backend.example.com/api/public/solar/visit-letter/sess-123')
      expect(html).toContain('Carta de intención')
    } finally {
      process.env.BACKEND_URL = previous
    }
  })

  it('omits the letter link when the contact has no sessionId', async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue({ sessionId: null, qualificationData: null } as any)

    await sendVisitEmailNotification(WS, { contact: CONTACT, appointment: APPT, kind: 'created' })

    const html = vi.mocked(sendGmailEmail).mock.calls[0][1].html
    expect(html).not.toContain('visit-letter')
  })

  it('does nothing for a CALL appointment', async () => {
    await sendVisitEmailNotification(WS, { contact: CONTACT, appointment: { type: 'CALL', scheduledAt: APPT.scheduledAt }, kind: 'created' })

    expect(sendGmailEmail).not.toHaveBeenCalled()
  })

  it('does nothing when visitNotifyEmails is not configured', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ visitNotifyEmails: null } as any)

    await sendVisitEmailNotification(WS, { contact: CONTACT, appointment: APPT, kind: 'created' })

    expect(sendGmailEmail).not.toHaveBeenCalled()
  })
})
