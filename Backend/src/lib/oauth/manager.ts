import { MetaAdsProvider } from './providers/meta'
import { GoogleAdsProvider } from './providers/google'
import { ShopifyProvider } from './providers/shopify'
import { IOAuthProvider } from './types'

export class OAuthManager {
  private static providers: Record<string, IOAuthProvider> = {
    meta: new MetaAdsProvider(),
    google: new GoogleAdsProvider(),
    shopify: new ShopifyProvider()
  }

  static getProvider(platform: string): IOAuthProvider {
    const provider = this.providers[platform.toLowerCase()]
    if (!provider) {
      throw new Error(`OAuth: Unsupported platform "${platform}"`)
    }
    return provider
  }
}
