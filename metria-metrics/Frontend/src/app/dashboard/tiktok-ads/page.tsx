import type { Metadata } from 'next'
import TikTokAdsPageClient from './PageClient'

export const metadata: Metadata = {
    title: 'TikTok Ads | Metria',
    description: 'Métricas de campañas en TikTok Ads: alcance, clics y conversiones'
}

export default function TikTokAdsPage() {
    return <TikTokAdsPageClient />
}
