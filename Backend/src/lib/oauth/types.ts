export interface OAuthTokenResponse {
  accessToken: string
  refreshToken?: string
  expiresAt?: Date
  scope?: string
  providerData?: Record<string, any> // e.g. shop domain, ad account ID
}

export interface IOAuthProvider {
  readonly platform: string
  
  /**
   * Generates the authorization URL to redirect the user to.
   * @param state A security string to prevent CSRF and store context (workspaceId).
   */
  getAuthUrl(state: string): string

  /**
   * Exchanges an authorization code for access and refresh tokens.
   * @param code The code returned by the provider in the callback.
   * @param redirectUri The registered redirect URI for verification.
   */
  exchangeCode(code: string, redirectUri: string): Promise<OAuthTokenResponse>

  /**
   * Refreshes an expired access token using a refresh token.
   * @param refreshToken The token used to fetch a new access token.
   */
  refreshToken(refreshToken: string): Promise<OAuthTokenResponse>
}
