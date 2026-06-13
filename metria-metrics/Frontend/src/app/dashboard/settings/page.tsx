import type { Metadata } from 'next'
import SettingsPageClient from './PageClient'

export const metadata: Metadata = {
    title: 'Configuración Técnica | Metria',
    description: 'Integraciones, API keys y configuración de la plataforma'
}

export default function SettingsPage() {
    return <SettingsPageClient />
}
