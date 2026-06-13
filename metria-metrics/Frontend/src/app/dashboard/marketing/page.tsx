import type { Metadata } from 'next'
import MarketingPageClient from './PageClient'

export const metadata: Metadata = {
    title: 'Marketing & Ads | Metria',
    description: 'Rendimiento de campañas publicitarias en Meta, Google y TikTok'
}

export default function MarketingPage() {
    return <MarketingPageClient />
}
