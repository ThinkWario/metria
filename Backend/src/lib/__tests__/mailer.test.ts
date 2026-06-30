import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSendEmail = vi.fn()

vi.mock('../../modules/campaigns/drivers', () => ({
  getDriver: vi.fn(() => ({ name: 'mock', sendEmail: mockSendEmail, sendSms: vi.fn(), sendWhatsapp: vi.fn() }))
}))

import { sendWelcomeEmail } from '../mailer'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('sendWelcomeEmail', () => {
  it('sends a welcome email with the recipient name in the body', async () => {
    mockSendEmail.mockResolvedValue({ ok: true, provider: 'resend' })

    await sendWelcomeEmail('ana@example.com', 'Ana')

    expect(mockSendEmail).toHaveBeenCalledWith(
      'ana@example.com',
      expect.stringContaining('Metria'),
      expect.stringContaining('Ana')
    )
  })

  it('does not throw when the driver reports a failed send', async () => {
    mockSendEmail.mockResolvedValue({ ok: false, provider: 'resend', error: 'bad recipient' })

    await expect(sendWelcomeEmail('ana@example.com', 'Ana')).resolves.toBeUndefined()
  })
})
