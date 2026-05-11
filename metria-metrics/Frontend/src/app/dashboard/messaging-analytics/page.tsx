import type { Metadata } from 'next'
import MessagingAnalyticsClient from './MessagingAnalyticsClient'

export const metadata: Metadata = {
  title: 'Messaging Analytics | Metria'
}

export default function MessagingAnalyticsPage() {
  return <MessagingAnalyticsClient />
}
