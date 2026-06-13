import type { Metadata } from 'next'
import AiAgentSettingsClient from './AiAgentSettingsClient'

export const metadata: Metadata = {
    title: 'Configuración IA | Metria',
    description: 'Configura el agente de inteligencia artificial y sus canales'
}

export default function AiAgentSettingsPage() {
    return <AiAgentSettingsClient />
}
