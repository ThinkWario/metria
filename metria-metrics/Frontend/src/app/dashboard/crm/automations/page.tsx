import type { Metadata } from 'next'
import AutomationsClient from './AutomationsClient'

export const metadata: Metadata = {
  title: 'Automatizaciones | CRM | Metria',
  description: 'Dispara acciones automáticamente cuando ocurre un evento'
}

export default function AutomationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Automatizaciones</h1>
        <p className="text-sm text-muted-foreground mt-1">Dispara acciones automáticamente cuando ocurre un evento</p>
      </div>
      <AutomationsClient />
    </div>
  )
}
