import type { Metadata } from 'next'
import BotListClient from './BotListClient'

export const metadata: Metadata = {
  title: 'Bots | Metria',
  description: 'Automatizaciones de mensajería'
}

export default function BotsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Bots</h1>
        <p className="text-sm text-muted-foreground mt-1">Automatizaciones para mensajes entrantes</p>
      </div>
      <BotListClient />
    </div>
  )
}
