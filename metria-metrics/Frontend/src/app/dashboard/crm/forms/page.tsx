import type { Metadata } from 'next'
import FormsClient from './FormsClient'

export const metadata: Metadata = {
  title: 'Formularios | CRM | Metria',
  description: 'Crea formularios públicos de captura de leads que alimentan tu CRM'
}

export default function FormsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Formularios</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Crea formularios públicos de captura. Cada envío entra como lead y dispara tus automatizaciones.
        </p>
      </div>
      <FormsClient />
    </div>
  )
}
