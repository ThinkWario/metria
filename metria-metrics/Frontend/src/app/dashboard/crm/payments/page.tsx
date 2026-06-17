import type { Metadata } from 'next'
import PaymentsClient from './PaymentsClient'

export const metadata: Metadata = {
  title: 'Cobros | CRM | Metria',
  description: 'Genera links de pago con MercadoPago y haz seguimiento de su estado'
}

export default function PaymentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Cobros</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Genera links de pago con MercadoPago y haz seguimiento de su estado.
        </p>
      </div>
      <PaymentsClient />
    </div>
  )
}
