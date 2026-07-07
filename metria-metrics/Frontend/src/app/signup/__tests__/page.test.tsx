import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))

const { mockSignup } = vi.hoisted(() => ({ mockSignup: vi.fn() }))
vi.mock('../actions', () => ({ signup: mockSignup }))

import SignupPage from '../page'

beforeEach(() => { vi.clearAllMocks() })

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>, email: string) {
    await user.type(screen.getByLabelText(/nombre del workspace/i), 'Acme')
    await user.type(screen.getByLabelText(/tu nombre completo/i), 'New User')
    await user.type(screen.getByLabelText(/correo electrónico/i), email)
    await user.type(screen.getByLabelText(/contraseña/i), 'longenough1')
    await user.click(screen.getByRole('button', { name: /comenzar gratis/i }))
}

describe('SignupPage', () => {
    it('shows a check-your-email confirmation and does not redirect when verification is required', async () => {
        mockSignup.mockResolvedValue({ success: true, requiresEmailVerification: true, email: 'new@example.com' })
        const user = userEvent.setup()
        render(<SignupPage />)

        await fillAndSubmit(user, 'new@example.com')

        expect(await screen.findByText(/revisa tu correo/i)).toBeInTheDocument()
        expect(mockPush).not.toHaveBeenCalled()
    })

    it('still redirects to dashboard on a normal successful signup', async () => {
        mockSignup.mockResolvedValue({ success: true, token: 'abc', user: { id: 'u1' } })
        const user = userEvent.setup()
        render(<SignupPage />)

        await fillAndSubmit(user, 'existing@example.com')

        await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard'))
    })
})
