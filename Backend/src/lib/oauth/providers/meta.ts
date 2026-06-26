import { IOAuthProvider, OAuthTokenResponse } from '../types';

/**
 * Meta Ads OAuth Provider
 * Implements the exchange from code to short-lived token, 
 * and immediately upgrades it to a long-lived token (60 days).
 */
export class MetaAdsProvider implements IOAuthProvider {
  readonly platform = 'META';
  private readonly clientId = process.env.META_APP_ID;
  private readonly clientSecret = process.env.META_APP_SECRET;
  private readonly apiVersion = 'v19.0';
  private readonly baseUrl = 'https://graph.facebook.com';

  /**
   * Generates the Meta Authorization URL.
   */
  getAuthUrl(state: string): string {
    const scopes = [
      'ads_read',
      'ads_management',
      'business_management',
      'pages_read_engagement',
      'pages_show_list',
      'pages_manage_metadata',
      'pages_messaging',
      'instagram_basic',
      'instagram_manage_messages',
    ].join(',');

    // Note: redirect_uri is handled by the route that calls this
    return `https://www.facebook.com/${this.apiVersion}/dialog/oauth?client_id=${this.clientId}&state=${state}&scope=${scopes}&response_type=code`;
  }

  /**
   * Exchanges the authorization code for a short-lived token, 
   * then upgrades it to a long-lived token.
   */
  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokenResponse> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Meta Ads OAuth: Missing META_APP_ID or META_APP_SECRET in environment');
    }

    // 1. Exchange code for short-lived token (valid for ~2 hours)
    const shortLivedUrl = `${this.baseUrl}/${this.apiVersion}/oauth/access_token?` + 
      new URLSearchParams({
        client_id: this.clientId,
        redirect_uri: redirectUri,
        client_secret: this.clientSecret,
        code
      }).toString();

    const shortLivedResponse = await fetch(shortLivedUrl);

    if (!shortLivedResponse.ok) {
      const error = await shortLivedResponse.json();
      throw new Error(`Meta OAuth Error (Short-lived): ${JSON.stringify(error)}`);
    }

    const shortLivedData = await shortLivedResponse.json() as { access_token: string };

    // 2. Upgrade to long-lived token (valid for ~60 days)
    const longLivedUrl = `${this.baseUrl}/${this.apiVersion}/oauth/access_token?` + 
      new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        fb_exchange_token: shortLivedData.access_token
      }).toString();

    const longLivedResponse = await fetch(longLivedUrl);

    if (!longLivedResponse.ok) {
      const error = await longLivedResponse.json();
      throw new Error(`Meta OAuth Error (Long-lived): ${JSON.stringify(error)}`);
    }

    const longLivedData = await longLivedResponse.json() as { access_token: string, expires_in?: number };

    const expiresAt = longLivedData.expires_in 
      ? new Date(Date.now() + longLivedData.expires_in * 1000) 
      : undefined;

    return {
      accessToken: longLivedData.access_token,
      expiresAt,
      providerData: {
        tokenType: 'long-lived'
      }
    };
  }

  /**
   * Refreshes a token. Meta doesn't use refresh tokens in the traditional sense;
   * instead, long-lived tokens are replaced by new long-lived tokens or re-authenticated.
   */
  async refreshToken(refreshToken: string): Promise<OAuthTokenResponse> {
    if (!this.clientId || !this.clientSecret) {
        throw new Error('Meta Ads OAuth: Missing META_APP_ID or META_APP_SECRET in environment');
    }

    const refreshUrl = `${this.baseUrl}/${this.apiVersion}/oauth/access_token?` + 
      new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        fb_exchange_token: refreshToken
      }).toString();

    const response = await fetch(refreshUrl);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Meta Token Refresh Error: ${JSON.stringify(error)}`);
    }

    const data = await response.json() as { access_token: string, expires_in?: number };
    
    return {
      accessToken: data.access_token,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined
    };
  }
}
