import type { Metadata } from 'next'
import SheetsClient from './SheetsClient'

export const metadata: Metadata = {
  title: 'Planillas Google Sheets | Metria',
  description: 'Importa leads desde Google Sheets al CRM automáticamente',
}

export default function SheetsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Google Sheets → CRM</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Vincula planillas para importar leads automáticamente cada 5 minutos
        </p>
      </div>
      <SheetsClient />
    </div>
  )
}
