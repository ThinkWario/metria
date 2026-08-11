import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: { workspace: { findUnique: vi.fn() } }
}))
vi.mock('../google-calendar.service', () => ({
  getAccessToken: vi.fn(async () => 'access-token-123')
}))

import { sendGmailEmail } from '../gmail.service'
import { prisma } from '../../../lib/prisma'
import { getAccessToken } from '../google-calendar.service'

const WS = 'ws-1'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ googleCalEmail: 'drillchilecl@gmail.com' } as any)
  global.fetch = vi.fn(async () => ({ ok: true, text: async () => '' })) as any
})

describe('sendGmailEmail', () => {
  it('sends via the Gmail API with the refreshed access token', async () => {
    await sendGmailEmail(WS, { to: ['a@drillchile.cl'], subject: 'Aviso', html: '<p>hola</p>' })

    expect(getAccessToken).toHaveBeenCalledWith(WS)
    expect(fetch).toHaveBeenCalledWith(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer access-token-123' })
      })
    )
  })

  it('encodes the raw MIME message as base64url in the request body', async () => {
    await sendGmailEmail(WS, { to: ['a@drillchile.cl'], subject: 'Aviso', html: '<p>hola</p>' })

    const call = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse(call[1]!.body as string)
    expect(body.raw).not.toMatch(/[+/=]/) // base64url has no +, /, or padding =
    const decoded = Buffer.from(body.raw, 'base64url').toString('utf-8')
    expect(decoded).toContain('From: drillchilecl@gmail.com')
    expect(decoded).toContain('To: a@drillchile.cl')
    expect(decoded).toContain('<p>hola</p>')
  })

  it('throws when the workspace has no connected Google account', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ googleCalEmail: null } as any)

    await expect(
      sendGmailEmail(WS, { to: ['a@drillchile.cl'], subject: 'Aviso', html: '<p>hola</p>' })
    ).rejects.toThrow('google_calendar_not_connected')
  })

  it('throws with the Gmail API error body when the send fails', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, text: async () => 'insufficient scope' })) as any

    await expect(
      sendGmailEmail(WS, { to: ['a@drillchile.cl'], subject: 'Aviso', html: '<p>hola</p>' })
    ).rejects.toThrow('insufficient scope')
  })
})
