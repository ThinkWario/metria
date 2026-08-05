import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { WhatsAppTemplatesPanel } from '../WhatsAppTemplatesPanel'

export const metadata: Metadata = {
    title: 'Plantillas de WhatsApp | Metria',
    description: 'Crea, revisa y asigna las plantillas HSM de WhatsApp del workspace'
}

export default function WhatsAppTemplatesPage() {
    return (
        <div className="container mx-auto py-8 px-4 max-w-4xl space-y-6">
            <Link
                href="/dashboard/settings/channels"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
            >
                <ArrowLeft className="h-3.5 w-3.5" />
                Volver a Canales
            </Link>
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Plantillas de WhatsApp</h1>
                <p className="text-muted-foreground">
                    Plantillas HSM aprobadas por Meta, usadas para saludo inicial, aviso de visita técnica y confirmación de visita.
                </p>
            </div>
            <WhatsAppTemplatesPanel />
        </div>
    )
}
