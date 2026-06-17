import type { Metadata } from 'next'
import CampaignsClient from './CampaignsClient'

export const metadata: Metadata = {
  title: 'Campañas | CRM | Metria',
  description: 'Envía email, SMS o WhatsApp masivo a tus segmentos de contactos',
}

export default function CampaignsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Campañas</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Envía email, SMS o WhatsApp masivo a tus segmentos de contactos
        </p>
      </div>
      <CampaignsClient />
    </div>
  )
}
