import type { Metadata } from 'next'
import TicketsClient from './TicketsClient'

export const metadata: Metadata = {
  title: 'Tickets | Metria',
  description: 'Tickets de soporte y atención al cliente'
}

export default function TicketsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tickets</h1>
        <p className="text-sm text-muted-foreground mt-1">Solicitudes de soporte y atención</p>
      </div>
      <TicketsClient />
    </div>
  )
}
