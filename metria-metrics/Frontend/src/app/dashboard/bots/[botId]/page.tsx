import type { Metadata } from 'next'
import BotDetailClient from './BotDetailClient'

export const metadata: Metadata = {
  title: 'Flujos del Bot | Metria',
}

export default function BotDetailPage({ params }: { params: { botId: string } }) {
  return <BotDetailClient botId={params.botId} />
}
