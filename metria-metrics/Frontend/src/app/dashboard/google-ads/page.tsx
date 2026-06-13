import type { Metadata } from 'next'
import GoogleAdsPageClient from './PageClient'

export const metadata: Metadata = {
    title: 'Google Ads | Metria',
    description: 'Rendimiento de campañas en Google Ads: ROAS, CPC e impresiones'
}

export default function GoogleAdsPage() {
    return <GoogleAdsPageClient />
}
