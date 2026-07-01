import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MetaIntegrationCard } from '@/components/settings/MetaIntegrationCard'
import { updateIntegration } from '@/lib/api'

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual('@/lib/api')
  return { ...actual, updateIntegration: vi.fn(), fetchAPI: vi.fn() }
})

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

beforeEach(() => vi.clearAllMocks())

describe('MetaIntegrationCard — Pixel ID', () => {
  it('saves a new Pixel ID, preserving the rest of the existing config', async () => {
    const user = userEvent.setup()
    vi.mocked(updateIntegration).mockResolvedValue({})

    renderWithClient(
      <MetaIntegrationCard
        integration={{ status: 'Connected', config: { accessToken: 'tok123', adAccountId: '999' } }}
        token="tok"
      />
    )

    await user.type(screen.getByLabelText(/pixel id/i), '1234567890')
    await user.click(screen.getByRole('button', { name: /guardar pixel/i }))

    await waitFor(() => {
      expect(updateIntegration).toHaveBeenCalledWith({
        platform: 'meta',
        name: 'Meta Ads',
        type: 'REST API',
        config: { accessToken: 'tok123', adAccountId: '999', pixelId: '1234567890' }
      })
    })
  })

  it('shows the currently saved Pixel ID when one exists', () => {
    renderWithClient(
      <MetaIntegrationCard
        integration={{ status: 'Connected', config: { accessToken: 'tok123', adAccountId: '999', pixelId: '555000111' } }}
        token="tok"
      />
    )
    expect(screen.getByDisplayValue('555000111')).toBeInTheDocument()
  })
})
