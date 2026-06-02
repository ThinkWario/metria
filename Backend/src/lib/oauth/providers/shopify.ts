import { IOAuthProvider, OAuthTokenResponse } from '../types';

/**
 * Shopify OAuth Provider
 * Implements the offline access token flow for Metria as a Public App.
 */
export class ShopifyProvider implements IOAuthProvider {
  readonly platform = 'SHOPIFY';
  private readonly apiKey = process.env.SHOPIFY_API_KEY;
  private readonly apiSecret = process.env.SHOPIFY_API_SECRET;
  private readonly scopes = process.env.SHOPIFY_SCOPES || 'read_orders,read_products,read_customers';

  /**
   * Generates the Shopify Installation URL.
   * Note: Shopify needs the shop domain. For the generic interface, 
   * we assume the 'state' parameter contains 'shop=domain.myshopify.com&workspaceId=...'.
   */
  getAuthUrl(state: string): string {
    const params = new URLSearchParams(state);
    const shop = params.get('shop');
    
    if (!shop) {
      throw new Error('Shopify OAuth: Missing shop domain in state');
    }

    const cleanShop = shop.replace(/^https?:\/\//, '').replace(/\/$/, '');
    
    const authParams = new URLSearchParams({
      client_id: this.apiKey!,
      scope: this.scopes,
      redirect_uri: process.env.SHOPIFY_REDIRECT_URI!,
      state: state,
      'grant_options[]': 'per-user' // Or remove for offline token
    });

    return `https://${cleanShop}/admin/oauth/authorize?${authParams.toString()}`;
  }

  /**
   * Exchanges the authorization code for a permanent access token.
   */
  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokenResponse> {
    // We need the shop domain again to call the correct endpoint.
    // This provider assumes the redirectUri is actually the shop domain 
    // or it's provided in some other way. For simplicity, we'll parse it from 
    // a global context or assume the caller handles the URL.
    
    // In a real implementation, the 'shop' comes from the query params of the callback.
    // Here we use a placeholder that the Route handler will replace.
    const shop = (global as any).currentShopContext; 

    if (!shop) {
      throw new Error('Shopify OAuth: Shop domain context lost during exchange');
    }

    const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: this.apiKey,
        client_secret: this.apiSecret,
        code
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Shopify OAuth Error: ${error}`);
    }

    const data = await response.json() as { access_token: string, scope: string };

    return {
      accessToken: data.access_token,
      scope: data.scope,
      providerData: {
        shop
      }
    };
  }

  /**
   * Shopify offline tokens do not expire and don't need refreshing.
   */
  async refreshToken(refreshToken: string): Promise<OAuthTokenResponse> {
    return {
      accessToken: refreshToken,
      providerData: { note: 'Shopify offline tokens do not expire' }
    };
  }
}
