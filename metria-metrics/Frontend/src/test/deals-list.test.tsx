import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DealsListClient from '../app/dashboard/crm/deals/DealsListClient'
import { fetchAPI } from '@/lib/api'

vi.mock('@/lib/api', () => ({ fetchAPI: vi.fn() }))

const mockPipelines = [
  { id: 'p1', name: 'Pipeline de Ventas', isDefault: true, stages: [{ id: 's1', name: 'Contactado', color: '#000', order: 0, isWon: false, isLost: false }], _count: { deals: 2 } }
]

const mockDeals = [
  {
    id: 'd1', title: 'Venta A', value: '100000', status: 'OPEN', probability: 40,
    expectedCloseAt: null, createdAt: '2026-01-01',
    contact: { id: 'c1', name: 'Ana' }, stage: { id: 's1', name: 'Contactado', color: '#000' }
  },
  {
    id: 'd2', title: 'Venta B', value: '9000000', status: 'OPEN', probability: 80,
    expectedCloseAt: '2026-07-01', createdAt: '2026-01-02',
    contact: { id: 'c2', name: 'Beto' }, stage: { id: 's1', name: 'Contactado', color: '#000' }
  }
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(fetchAPI).mockImplementation((url: string) => {
    if (url === '/crm/pipelines') return Promise.resolve(mockPipelines)
    if (url === '/crm/deals') return Promise.resolve(mockDeals)
    return Promise.resolve([])
  })
})

describe('DealsListClient', () => {
  it('renders every deal from GET /crm/deals with no pipelineId filter', async () => {
    render(<DealsListClient />)
    await waitFor(() => expect(screen.getByText('Venta A')).toBeInTheDocument())
    expect(screen.getByText('Venta B')).toBeInTheDocument()
    expect(fetchAPI).toHaveBeenCalledWith('/crm/deals')
  })

  it('sorts by clicking the Valor column header', async () => {
    const user = userEvent.setup()
    render(<DealsListClient />)
    await waitFor(() => expect(screen.getByText('Venta A')).toBeInTheDocument())

    await user.click(screen.getByRole('columnheader', { name: /valor/i }))

    const rows = screen.getAllByRole('row').slice(1) // skip header row
    expect(rows[0]).toHaveTextContent('Venta A') // ascending: 100000 before 9000000
  })

  it('opens the create-deal modal with the default pipeline context', async () => {
    const user = userEvent.setup()
    render(<DealsListClient />)
    await waitFor(() => expect(screen.getByText('Venta A')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /nuevo deal/i }))

    expect(await screen.findByRole('heading', { name: /nuevo deal/i })).toBeInTheDocument()
  })
})
