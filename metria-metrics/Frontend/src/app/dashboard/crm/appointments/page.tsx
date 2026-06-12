import type { Metadata } from 'next'
import AppointmentsClient from './AppointmentsClient'

export const metadata: Metadata = {
  title: 'Citas | Metria',
  description: 'Citas agendadas con tus contactos: visitas técnicas y llamadas'
}

export default function AppointmentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Citas</h1>
        <p className="text-sm text-muted-foreground mt-1">Visitas técnicas y llamadas agendadas con tus contactos</p>
      </div>
      <AppointmentsClient />
    </div>
  )
}
