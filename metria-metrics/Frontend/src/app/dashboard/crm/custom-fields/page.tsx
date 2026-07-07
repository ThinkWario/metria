import type { Metadata } from 'next'
import CustomFieldsClient from './CustomFieldsClient'

export const metadata: Metadata = {
  title: 'Campos Personalizados | Metria',
}

export default function CustomFieldsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Campos Personalizados</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Define campos reusables para tus contactos (ej. RUT, Comuna) — disponibles al importar
          planillas o crear contactos manualmente.
        </p>
      </div>
      <CustomFieldsClient />
    </div>
  )
}
