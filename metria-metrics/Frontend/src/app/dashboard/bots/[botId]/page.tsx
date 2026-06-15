import type { Metadata } from 'next'
import BotDetailClient from './BotDetailClient'

export const metadata: Metadata = {
  title: 'Flujos del Bot | Metria',
}

export default async function BotDetailPage({ params }: { params: Promise<{ botId: string }> }) {
  const { botId } = await params
  return <BotDetailClient botId={botId} />
}
