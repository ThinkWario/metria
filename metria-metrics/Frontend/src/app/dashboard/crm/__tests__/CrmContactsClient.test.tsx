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

const makePage = (start: number, size: number) =>
  Array.from({ length: size }, (_, i) => ({
    ...contacts[1],
    id: `pg-${start + i}`,
    name: `Lead ${start + i}`,
    createdAt: new Date(2026, 0, 1, 0, 0, 1000 - (start + i)).toISOString(),
  }))

describe('CrmContactsClient — total y paginación', () => {
  it('muestra el total real del servidor, no solo los contactos cargados', async () => {
    const page = makePage(0, 50)
    vi.mocked(fetchAPI).mockImplementation((url: string) => {
      if (url.startsWith('/crm/contacts/count')) return Promise.resolve({ total: 120 })
      if (url.startsWith('/crm/contacts?')) return Promise.resolve(page)
      return Promise.resolve(null)
    })
    render(<CrmContactsClient />)

    expect(await screen.findByText('120')).toBeInTheDocument()
  })

  it('"Cargar más" pide la siguiente página con cursor y agrega los contactos', async () => {
    const user = userEvent.setup()
    const first = makePage(0, 50)
    const second = makePage(50, 20)
    vi.mocked(fetchAPI).mockImplementation((url: string) => {
      if (url.startsWith('/crm/contacts/count')) return Promise.resolve({ total: 70 })
      if (url.startsWith('/crm/contacts?') && url.includes('cursor=')) return Promise.resolve(second)
      if (url.startsWith('/crm/contacts?')) return Promise.resolve(first)
      return Promise.resolve(null)
    })
    render(<CrmContactsClient />)

    await user.click(await screen.findByRole('button', { name: /cargar más/i }))

    expect(await screen.findByText('Lead 69')).toBeInTheDocument()
    expect(screen.getByText('Lead 0')).toBeInTheDocument()
    const cursorCall = vi.mocked(fetchAPI).mock.calls.map(c => c[0] as string).find(u => u.includes('cursor='))!
    expect(decodeURIComponent(cursorCall)).toContain(`cursor=${first[49].createdAt}`)
    expect(screen.queryByRole('button', { name: /cargar más/i })).not.toBeInTheDocument()
  })

  it('no muestra "Cargar más" cuando todo cabe en una página', async () => {
    vi.mocked(fetchAPI).mockImplementation((url: string) => {
      if (url.startsWith('/crm/contacts/count')) return Promise.resolve({ total: 2 })
      if (url.startsWith('/crm/contacts?')) return Promise.resolve(contacts)
      return Promise.resolve(null)
    })
    render(<CrmContactsClient />)

    await screen.findByText('Sin Chats')
    expect(screen.queryByRole('button', { name: /cargar más/i })).not.toBeInTheDocument()
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
