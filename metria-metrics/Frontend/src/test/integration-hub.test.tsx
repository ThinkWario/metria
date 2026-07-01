import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { IntegrationHub } from '@/components/settings/integration-hub'

describe('IntegrationHub', () => {
  it('renders all platform cards when nothing is hidden', () => {
    render(<IntegrationHub integrations={[]} token="tok" />)
    expect(screen.getByText('Shopify Store')).toBeInTheDocument()
    expect(screen.getByText('Google Ads')).toBeInTheDocument()
    expect(screen.getByText('WhatsApp Native')).toBeInTheDocument()
  })

  it('hides the Shopify card when integration:shopify is in hiddenMenuItems', () => {
    render(<IntegrationHub integrations={[]} token="tok" hiddenMenuItems={['integration:shopify']} />)
    expect(screen.queryByText('Shopify Store')).not.toBeInTheDocument()
    expect(screen.getByText('Google Ads')).toBeInTheDocument()
  })
})
