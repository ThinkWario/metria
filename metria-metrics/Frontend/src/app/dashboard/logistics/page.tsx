import type { Metadata } from 'next'
import LogisticsPageClient from './PageClient'

export const metadata: Metadata = {
    title: 'Logística & Operaciones | Metria',
    description: 'Seguimiento de envíos, devoluciones y costos operativos'
}

export default function LogisticsPage() {
    return <LogisticsPageClient />
}
