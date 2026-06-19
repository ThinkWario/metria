import { IOAuthProvider, OAuthTokenResponse } from '../types'

/**
 * Google Calendar OAuth Provider
 * Scopes: calendar read/write + email/profile for user identification.
 * Uses GOOGLE_CALENDAR_CLIENT_ID / GOOGLE_CALENDAR_CLIENT_SECRET env vars.
 * Falls back to GOOGLE_ADS_CLIENT_ID / SECRET if calendar-specific vars not set
 * (same GCP project is common).
 */
export class GoogleCalendarProvider implements IOAuthProvider {
  readonly platform = 'GOOGLE_CALENDAR'

  private get clientId() {
    return process.env.GOOGLE_CALENDAR_CLIENT_ID ?? process.env.GOOGLE_ADS_CLIENT_ID ?? ''
  }
  private get clientSecret() {
    return process.env.GOOGLE_CALENDAR_CLIENT_SECRET ?? process.env.GOOGLE_ADS_CLIENT_SECRET ?? ''
  }

  getAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: process.env.GOOGLE_CALENDAR_REDIRECT_URI!,
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
