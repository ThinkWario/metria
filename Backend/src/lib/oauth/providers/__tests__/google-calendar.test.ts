import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { GoogleCalendarProvider } from '../google-calendar'

describe('GoogleCalendarProvider.getAuthUrl', () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, BACKEND_URL: 'https://api.metria.test' }
  })

  afterEach(() => {
    process.env = ORIGINAL_ENV
  })

  it('uses the redirect_uri that matches the registered callback route', () => {
    const provider = new GoogleCalendarProvider()
    const url = new URL(provider.getAuthUrl('workspace-123'))

    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://api.metria.test/api/integrations/google-calendar/callback'
    )
  })

  it('passes the workspaceId through as the OAuth state param', () => {
    const provider = new GoogleCalendarProvider()
    const url = new URL(provider.getAuthUrl('workspace-123'))

    expect(url.searchParams.get('state')).toBe('workspace-123')
  })
})
