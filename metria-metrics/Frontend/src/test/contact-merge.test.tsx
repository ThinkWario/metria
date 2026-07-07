import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ContactProfileClient from '../app/dashboard/crm/contacts/[contactId]/ContactProfileClient'
import { fetchAPI } from '@/lib/api'

vi.mock('@/lib/api', () => ({ fetchAPI: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ back: vi.fn(), push: vi.fn() }) }))

const mockContact = {
  id: 'ct-1', name: 'Juan Perez', email: null, phone: 'ig_98765', status: 'LEAD',
  ltv: '0', healthScore: null, source: 'INSTAGRAM', createdAt: '2026-01-01',
  leadScore: null, leadTemperature: null, leadType: null,
  tags: [], contactNotes: [], deals: [], tickets: [], conversations: [],
  customFields: { rut: '11.111.111-1' }
}

const mockDuplicate = { id: 'ct-2', name: 'Juan Perez', phone: '+56912345678', email: null, source: 'WHATSAPP', createdAt: '2026-01-01', status: 'LEAD' }
const mockCustomFieldDefs = [{ id: 'cf-1', key: 'rut', label: 'RUT' }]

function mockFetch(duplicates: unknown[] = [mockDuplicate], customFieldDefs: unknown[] = mockCustomFieldDefs) {
  vi.mocked(fetchAPI).mockImplementation((url: string) => {
    if (url === '/crm/contacts/ct-1') return Promise.resolve(mockContact)
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
