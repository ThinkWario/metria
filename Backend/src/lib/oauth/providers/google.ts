import { IOAuthProvider, OAuthTokenResponse } from '../types';

/**
 * Google Ads OAuth Provider
 * Implements the exchange for permanent refresh tokens.
 */
export class GoogleAdsProvider implements IOAuthProvider {
  readonly platform = 'GOOGLE';
  private readonly clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  private readonly clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  private readonly tokenUrl = 'https://oauth2.googleapis.com/token';

  /**
   * Generates the Google Authorization URL.
   */
  getAuthUrl(state: string): string {
    const scopes = ['https://www.googleapis.com/auth/adwords'].join(' ');
    const redirectUri = `${process.env.BACKEND_URL}/api/oauth/google/callback`;

    const params = new URLSearchParams({
      client_id: this.clientId!,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes,
      state: state,
      access_type: 'offline',
      prompt: 'consent',
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Exchanges the authorization code for tokens.
   */
  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokenResponse> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Google Ads OAuth: Missing GOOGLE_ADS_CLIENT_ID or GOOGLE_ADS_CLIENT_SECRET in environment');
    }

    const response = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Google OAuth Error: ${JSON.stringify(error)}`);
    }

    const data = await response.json() as { 
      access_token: string, 
      refresh_token?: string, 
      expires_in: number 
    };

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000)
    };
  }

  /**
   * Refreshes the access token using the refresh token.
   */
  async refreshToken(refreshToken: string): Promise<OAuthTokenResponse> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Google Ads OAuth: Missing GOOGLE_ADS_CLIENT_ID or GOOGLE_ADS_CLIENT_SECRET in environment');
    }

    const response = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Google Token Refresh Error: ${JSON.stringify(error)}`);
    }

    const data = await response.json() as { access_token: string, expires_in: number };

    return {
      accessToken: data.access_token,
      refreshToken: refreshToken, // Google doesn't always rotate refresh tokens
      expiresAt: new Date(Date.now() + data.expires_in * 1000)
    };
  }
}
