import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ContactProfileClient from '../app/dashboard/crm/contacts/[contactId]/ContactProfileClient'
import { getActiveChannels } from '../app/dashboard/crm/contacts/[contactId]/getActiveChannels'
import { fetchAPI } from '@/lib/api'

vi.mock('@/lib/api', () => ({ fetchAPI: vi.fn() }))
const { mockRouterPush } = vi.hoisted(() => ({ mockRouterPush: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ back: vi.fn(), push: mockRouterPush }) }))

const mockContact = {
  id: 'ct-1', name: 'Juan Perez', email: null, phone: 'ig_98765', status: 'LEAD',
  ltv: '0', healthScore: null, source: 'INSTAGRAM', createdAt: '2026-01-01',
  leadScore: null, leadTemperature: null, leadType: null,
  tags: [], contactNotes: [], deals: [], tickets: [], conversations: [],
  customFields: { rut: '11.111.111-1' }
}

const mockDuplicate = { id: 'ct-2', name: 'Juan Perez', phone: '+56912345678', email: null, source: 'WHATSAPP', createdAt: '2026-01-01', status: 'LEAD' }
const mockCustomFieldDefs = [{ id: 'cf-1', key: 'rut', label: 'RUT' }]

function mockFetch(duplicates: unknown[] = [mockDuplicate], customFieldDefs: unknown[] = mockCustomFieldDefs, conversations: unknown[] = []) {
  vi.mocked(fetchAPI).mockImplementation((url: string) => {
    if (url === '/crm/contacts/ct-1') return Promise.resolve({ ...mockContact, conversations })
    if (url === '/crm/contacts/ct-1/value') return Promise.resolve({ ltv: 0, wonDealsValue: 0, wonDealsCount: 0, openPipelineValue: 0, openDealsCount: 0, lostDealsCount: 0, capturedValue: 0 })
    if (url === '/crm/contacts/ct-1/revenue-summary') return Promise.resolve(null)
    if (url === '/crm/contacts/ct-1/duplicates') return Promise.resolve(duplicates)
    if (url === '/crm/contacts/ct-1/merge') return Promise.resolve({ id: 'ct-1', name: 'Juan Perez' })
    if (url === '/crm/custom-fields') return Promise.resolve(customFieldDefs)
    if (url === '/crm/contacts/ct-1/custom-fields') return Promise.resolve({ id: 'ct-1', customFields: { rut: '22.222.222-2' } })
    return Promise.resolve(null)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFetch()
})

describe('ContactProfileClient — duplicate detection', () => {
  it('shows a duplicate banner when possible duplicates exist', async () => {
    render(<ContactProfileClient contactId="ct-1" />)

    expect(await screen.findByText(/posible contacto duplicado/i)).toBeInTheDocument()
    expect(fetchAPI).toHaveBeenCalledWith('/crm/contacts/ct-1/duplicates')
  })

  it('does not show the banner when there are no duplicates', async () => {
    mockFetch([])
    render(<ContactProfileClient contactId="ct-1" />)

    await waitFor(() => expect(screen.getByText('Juan Perez')).toBeInTheDocument())
    expect(screen.queryByText(/posible contacto duplicado/i)).not.toBeInTheDocument()
  })

  it('merges the duplicate when confirmed', async () => {
    const user = userEvent.setup()
    render(<ContactProfileClient contactId="ct-1" />)

    await user.click(await screen.findByRole('button', { name: /fusionar/i }))
    await user.click(await screen.findByRole('button', { name: /confirmar fusión/i }))

    await waitFor(() => expect(fetchAPI).toHaveBeenCalledWith('/crm/contacts/ct-1/merge', {
      method: 'POST',
      body: JSON.stringify({ duplicateContactId: 'ct-2' })
    }))
  })
})

describe('ContactProfileClient — custom fields', () => {
  it('renders an input per workspace custom field definition, pre-filled with the contact value', async () => {
    render(<ContactProfileClient contactId="ct-1" />)

    const input = await screen.findByLabelText('RUT') as HTMLInputElement
    expect(input.value).toBe('11.111.111-1')
  })

  it('saves edited custom field values', async () => {
    const user = userEvent.setup()
    render(<ContactProfileClient contactId="ct-1" />)

    const input = await screen.findByLabelText('RUT')
    await user.clear(input)
    await user.type(input, '22.222.222-2')
    await user.click(screen.getByRole('button', { name: /guardar campos/i }))

    await waitFor(() => expect(fetchAPI).toHaveBeenCalledWith(
      '/crm/contacts/ct-1/custom-fields',
      { method: 'PATCH', body: JSON.stringify({ values: { rut: '22.222.222-2' } }) }
    ))
  })
})

describe('getActiveChannels', () => {
  it('returns one entry per distinct platform, using the most recent conversation for that platform', () => {
    const conversations = [
      { id: 'conv-wa-old', status: 'CLOSED', messageCount: 1, lastMessageAt: '2026-01-01T00:00:00.000Z', channel: { platform: 'WHATSAPP', name: 'WA' } },
      { id: 'conv-wa-new', status: 'OPEN', messageCount: 0, lastMessageAt: '2026-02-01T00:00:00.000Z', channel: { platform: 'WHATSAPP', name: 'WA' } },
      { id: 'conv-ig', status: 'OPEN', messageCount: 3, lastMessageAt: null, channel: { platform: 'INSTAGRAM', name: 'IG' } },
    ]

    expect(getActiveChannels(conversations)).toEqual([
      { platform: 'WHATSAPP', conversationId: 'conv-wa-new' },
      { platform: 'INSTAGRAM', conversationId: 'conv-ig' },
    ])
  })

  it('returns an empty array for a contact with no conversations', () => {
    expect(getActiveChannels([])).toEqual([])
  })
})

describe('ContactProfileClient — channel quick access', () => {
  it('renders a chat icon for a channel with a conversation, even when it has zero messages', async () => {
    mockFetch([mockDuplicate], mockCustomFieldDefs, [
      { id: 'conv-wa-1', status: 'OPEN', messageCount: 0, lastMessageAt: null, channel: { platform: 'WHATSAPP', name: 'WhatsApp Principal' } }
    ])

    render(<ContactProfileClient contactId="ct-1" />)

    expect(await screen.findByRole('button', { name: /abrir chat de whatsapp/i })).toBeInTheDocument()
  })

  it('navigates to the inbox with that exact conversation id when clicked', async () => {
    mockFetch([mockDuplicate], mockCustomFieldDefs, [
      { id: 'conv-wa-1', status: 'OPEN', messageCount: 0, lastMessageAt: null, channel: { platform: 'WHATSAPP', name: 'WhatsApp Principal' } }
    ])
    const user = userEvent.setup()
    render(<ContactProfileClient contactId="ct-1" />)

    await user.click(await screen.findByRole('button', { name: /abrir chat de whatsapp/i }))

    expect(mockRouterPush).toHaveBeenCalledWith('/dashboard/inbox?conversationId=conv-wa-1')
  })

  it('renders no channel icon when the contact has no conversations', async () => {
    mockFetch()
    render(<ContactProfileClient contactId="ct-1" />)

    await screen.findByText('Juan Perez')
    expect(screen.queryByRole('button', { name: /abrir chat de/i })).not.toBeInTheDocument()
  })
})
