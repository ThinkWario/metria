import type { Metadata } from 'next'
import DealsListClient from './DealsListClient'

export const metadata: Metadata = {
  title: 'Deals | Metria',
  description: 'Lista completa de deals y oportunidades de venta'
}

export default function DealsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Deals</h1>
        <p className="text-sm text-muted-foreground mt-1">Todos los deals de todos los pipelines</p>
      </div>
      <DealsListClient />
    </div>
  )
}
