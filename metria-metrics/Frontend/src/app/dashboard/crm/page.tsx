import type { Metadata } from 'next'
import CrmContactsClient from './CrmContactsClient'

export const metadata: Metadata = {
  title: 'CRM — Contactos | Metria',
  description: 'Gestión de contactos, deals y tickets'
}

export default function CrmPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Contactos</h1>
        <p className="text-sm text-muted-foreground mt-1">Clientes, leads y prospectos de tu workspace</p>
      </div>
      <CrmContactsClient />
    </div>
  )
}
