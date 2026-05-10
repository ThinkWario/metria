import type { Metadata } from 'next'
import { InboxClient } from './InboxClient'

export const metadata: Metadata = {
  title: 'Inbox | Metria',
  description: 'Unified messaging inbox — WhatsApp, Instagram, Telegram'
}

export default function InboxPage() {
  return <InboxClient />
}
