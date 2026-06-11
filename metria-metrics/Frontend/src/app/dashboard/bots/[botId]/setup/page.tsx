import type { Metadata } from 'next'
import { AgentSetupWizard } from '@/components/bots/AgentSetupWizard'

export const metadata: Metadata = {
  title: 'Programa tu Agente | Metria',
  description: 'Configura tu agente de cierre de ventas con IA',
}

export default async function AgentSetupPage({ params }: { params: Promise<{ botId: string }> }) {
  const { botId } = await params
  return <AgentSetupWizard botId={botId} />
}
