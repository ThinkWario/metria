import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSet = vi.fn()
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ set: mockSet })) }))

global.fetch = vi.fn()

import { signup } from '../actions'

beforeEach(() => { vi.clearAllMocks() })

describe('signup action', () => {
  it('returns requiresEmailVerification and does not set a session cookie', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ requiresEmailVerification: true, email: 'new@example.com' })
    } as Response)

    const formData = new FormData()
    formData.set('workspaceName', 'Acme')
    formData.set('name', 'New User')
    formData.set('email', 'new@example.com')
    formData.set('password', 'longenough1')

    const result = await signup(formData)

    expect(result).toEqual({ success: true, requiresEmailVerification: true, email: 'new@example.com' })
    expect(mockSet).not.toHaveBeenCalled()
  })

  it('still sets a session cookie and returns a token on a normal signup', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'abc', user: { id: 'u1' } })
    } as Response)

    const formData = new FormData()
    formData.set('workspaceName', 'Acme')
    formData.set('name', 'New User')
    formData.set('email', 'existing@example.com')
    formData.set('password', 'longenough1')

    const result = await signup(formData)

    expect(result).toEqual({ success: true, token: 'abc', user: { id: 'u1' } })
    expect(mockSet).toHaveBeenCalledWith('metria_session', 'abc', expect.any(Object))
  })
})
