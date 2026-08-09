import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CrmContactsClient from '../CrmContactsClient'
import { fetchAPI } from '@/lib/api'

vi.mock('@/lib/api', () => ({ fetchAPI: vi.fn() }))
const { mockPush } = vi.hoisted(() => ({ mockPush: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))

// Mock ResizeObserver
if (typeof global.ResizeObserver === 'undefined') {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as any
}

const contacts = [
  {
    id: 'ct-1', name: 'Herbert Orrego', email: null, phone: '+56900000001', status: 'LEAD',
    ltv: 0, source: 'SOLAR_DIRECT', avatarUrl: null, leadScore: null, leadTemperature: 'HOT', leadType: null,
    _count: { conversations: 1, deals: 1, tickets: 0 }
  },
  {
    id: 'ct-2', name: 'Sin Chats', email: null, phone: '+56900000002', status: 'LEAD',
    ltv: 0, source: 'SOLAR_DIRECT', avatarUrl: null, leadScore: null, leadTemperature: null, leadType: null,
    _count: { conversations: 0, deals: 0, tickets: 0 }
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetchAPI).mockImplementation((url: string) => {
    if (url.startsWith('/crm/contacts?')) return Promise.resolve(contacts)
    return Promise.resolve(null)
  })
})

describe('CrmContactsClient — quick access to chat', () => {
  it('opens the inbox for the contact when the conversations badge is clicked', async () => {
    const user = userEvent.setup()
    render(<CrmContactsClient />)

    const badge = await screen.findByRole('button', { name: /abrir chat/i })
    await user.click(badge)

    expect(mockPush).toHaveBeenCalledWith('/dashboard/inbox?contactId=ct-1')
  })

  it('does not also navigate to the contact detail page when the badge is clicked', async () => {
    const user = userEvent.setup()
    render(<CrmContactsClient />)

    const badge = await screen.findByRole('button', { name: /abrir chat/i })
    await user.click(badge)

    expect(mockPush).not.toHaveBeenCalledWith('/dashboard/crm/contacts/ct-1')
  })

  it('renders no chat button for a contact with zero conversations', async () => {
    render(<CrmContactsClient />)

    await screen.findByText('Sin Chats')
    expect(screen.getAllByRole('button', { name: /abrir chat/i })).toHaveLength(1)
  })
})
