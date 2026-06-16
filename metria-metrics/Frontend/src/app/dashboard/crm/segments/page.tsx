import type { Metadata } from 'next'
import SegmentsClient from './SegmentsClient'

export const metadata: Metadata = {
  title: 'Segmentos | CRM | Metria',
  description: 'Grupos dinámicos de contactos según condiciones'
}

export default function SegmentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Segmentos</h1>
        <p className="text-sm text-muted-foreground mt-1">Grupos dinámicos de contactos según condiciones</p>
      </div>
      <SegmentsClient />
    </div>
  )
}
