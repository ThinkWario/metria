import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const mockPush = vi.fn()
const { mockUseSearchParams } = vi.hoisted(() => ({ mockUseSearchParams: vi.fn() }))
vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: mockPush }),
    useSearchParams: mockUseSearchParams
}))

const { mockVerifyEmail } = vi.hoisted(() => ({ mockVerifyEmail: vi.fn() }))
vi.mock('../actions', () => ({ verifyEmail: mockVerifyEmail }))

import VerifyEmailPage from '../page'

beforeEach(() => {
    vi.clearAllMocks()
    mockUseSearchParams.mockReturnValue(new URLSearchParams('token=goodtoken'))
})

describe('VerifyEmailPage', () => {
    it('calls verifyEmail with the token from the URL and shows the success state', async () => {
        mockVerifyEmail.mockResolvedValue({ success: true, token: 'jwt', user: { id: 'u1' } })
        render(<VerifyEmailPage />)

        expect(await screen.findByText(/correo verificado/i)).toBeInTheDocument()
        expect(mockVerifyEmail).toHaveBeenCalledWith('goodtoken')
    })

    it('shows an error state when verification fails', async () => {
        mockVerifyEmail.mockResolvedValue({ success: false, error: 'invalid_or_expired_token' })
        render(<VerifyEmailPage />)

        expect(await screen.findByText(/enlace inválido o expirado/i)).toBeInTheDocument()
    })
})
