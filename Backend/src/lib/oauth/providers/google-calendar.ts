import { IOAuthProvider, OAuthTokenResponse } from '../types'

/**
 * Google Calendar OAuth Provider — per-tenant.
 * Scopes: calendar read/write + email/profile.
 * Reuses GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET (same GCP project).
 * Tokens (access + refresh) are stored per workspace in the DB — never shared.
 */
export class GoogleCalendarProvider implements IOAuthProvider {
  readonly platform = 'GOOGLE_CALENDAR'

  private get clientId() {
    return process.env.GOOGLE_ADS_CLIENT_ID ?? ''
  }
  private get clientSecret() {
    return process.env.GOOGLE_ADS_CLIENT_SECRET ?? ''
  }

  private get redirectUri() {
    return `${process.env.BACKEND_URL ?? 'http://localhost:4000'}/api/integrations/google-calendar/callback`
  }

  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/calendar.readonly',
        'email',
        'profile'
      ].join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state
    })
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokenResponse> {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`[gcal] token exchange failed: ${err}`)
    }
    const data = await res.json() as {
      access_token: string
      refresh_token?: string
      expires_in: number
    }
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000)
    }
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokenResponse> {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'refresh_token'
      })
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`[gcal] token refresh failed: ${err}`)
    }
    const data = await res.json() as { access_token: string; expires_in: number }
    return {
      accessToken: data.access_token,
      refreshToken,
      expiresAt: new Date(Date.now() + data.expires_in * 1000)
    }
  }
}
