import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { IntegrationHub } from '@/components/settings/integration-hub'

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual('@/lib/api')
  return { ...actual, fetchAPI: vi.fn().mockResolvedValue({ connected: false, email: null, calendarId: null }) }
})

beforeEach(() => vi.clearAllMocks())

describe('IntegrationHub', () => {
  it('renders the OAuth platform cards plus the Google Calendar card, and no WhatsApp card', async () => {
    render(<IntegrationHub integrations={[]} token="tok" />)
    expect(screen.getByText('Shopify Store')).toBeInTheDocument()
    expect(screen.getByText('Google Ads')).toBeInTheDocument()
    expect(await screen.findByText('Google Calendar')).toBeInTheDocument()
    expect(screen.queryByText('WhatsApp Native')).not.toBeInTheDocument()
  })

  it('hides the Shopify card when integration:shopify is in hiddenMenuItems', async () => {
    render(<IntegrationHub integrations={[]} token="tok" hiddenMenuItems={['integration:shopify']} />)
    expect(screen.queryByText('Shopify Store')).not.toBeInTheDocument()
    expect(screen.getByText('Google Ads')).toBeInTheDocument()
    await screen.findByText('Google Calendar')
  })

  it('hides the Google Calendar card when integration:google-calendar is in hiddenMenuItems', async () => {
    render(<IntegrationHub integrations={[]} token="tok" hiddenMenuItems={['integration:google-calendar']} />)
    expect(screen.getByText('Google Ads')).toBeInTheDocument()
    expect(screen.queryByText('Google Calendar')).not.toBeInTheDocument()
  })
})
