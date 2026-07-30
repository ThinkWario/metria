import type { Metadata } from 'next'
import MetaEventsClient from './MetaEventsClient'

export const metadata: Metadata = {
    title: 'Eventos Meta (CAPI) | Metria',
    description: 'Cobertura y estado de los eventos de Meta Conversions API'
}

export default function MetaEventsPage() {
    return <MetaEventsClient />
}
