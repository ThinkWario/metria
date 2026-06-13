import type { Metadata } from 'next'
import SalesPageClient from './PageClient'

export const metadata: Metadata = {
    title: 'Canales de Venta | Metria',
    description: 'Análisis de ventas por canal: Shopify, Dropi y más'
}

export default function SalesPage() {
    return <SalesPageClient />
}
