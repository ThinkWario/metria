import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSet = vi.fn()
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ set: mockSet })) }))

global.fetch = vi.fn()

import { login } from '../actions'

beforeEach(() => { vi.clearAllMocks() })

describe('login action', () => {
    it('returns requiresEmailVerification and does not set a session cookie', async () => {
        vi.mocked(fetch).mockResolvedValue({
            ok: true,
            json: async () => ({ requiresEmailVerification: true, email: 'unverified@example.com' })
        } as Response)

        const formData = new FormData()
        formData.set('email', 'unverified@example.com')
        formData.set('password', 'pw12345678')

        const result = await login(formData)

        expect(result).toEqual({ success: true, requiresEmailVerification: true, email: 'unverified@example.com' })
        expect(mockSet).not.toHaveBeenCalled()
    })
})
