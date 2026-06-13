import type { Metadata } from 'next'
import FinancesPageClient from './PageClient'

export const metadata: Metadata = {
    title: 'Finanzas E-commerce | Metria',
    description: 'Métricas de rentabilidad neta, ROAS y costos logísticos'
}

export default function FinancesPage() {
    return <FinancesPageClient />
}
