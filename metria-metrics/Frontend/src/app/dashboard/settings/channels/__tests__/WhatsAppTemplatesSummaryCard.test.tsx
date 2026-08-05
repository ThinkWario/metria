import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const { mockFetchAPI } = vi.hoisted(() => ({ mockFetchAPI: vi.fn() }))
vi.mock('@/lib/api', () => ({ fetchAPI: mockFetchAPI }))

import { WhatsAppTemplatesSummaryCard } from '../WhatsAppTemplatesSummaryCard'

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchAPI.mockResolvedValue({
    templates: [
      { id: '1', status: 'APPROVED' },
      { id: '2', status: 'APPROVED' },
      { id: '3', status: 'PENDING' },
      { id: '4', status: 'REJECTED' }
    ]
  })
})

describe('WhatsAppTemplatesSummaryCard', () => {
  it('shows the counts by status and a link to the dedicated templates page', async () => {
    render(<WhatsAppTemplatesSummaryCard />)

    expect(await screen.findByText(/4 plantilla\(s\)/i)).toBeInTheDocument()
    expect(screen.getByText(/2 aprobada\(s\)/i)).toBeInTheDocument()
    expect(screen.getByText(/1 pendiente\(s\)/i)).toBeInTheDocument()
    expect(screen.getByText(/1 rechazada\(s\)/i)).toBeInTheDocument()

    const link = screen.getByRole('link', { name: /gestionar plantillas/i })
    expect(link).toHaveAttribute('href', '/dashboard/settings/channels/templates')
  })

  it('shows an error message instead of counts when the fetch fails', async () => {
    mockFetchAPI.mockReset()
    mockFetchAPI.mockRejectedValue(new Error('network error'))

    render(<WhatsAppTemplatesSummaryCard />)

    expect(await screen.findByText(/no se pudieron cargar las plantillas/i)).toBeInTheDocument()
    expect(screen.queryByText(/plantilla\(s\)/i)).not.toBeInTheDocument()

    const link = screen.getByRole('link', { name: /gestionar plantillas/i })
    expect(link).toHaveAttribute('href', '/dashboard/settings/channels/templates')
  })
})
