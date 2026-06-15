import type { Metadata } from 'next'
import ContactProfileClient from './ContactProfileClient'

export const metadata: Metadata = {
  title: 'Perfil de Contacto | Metria',
}

export default async function ContactProfilePage({ params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params
  return <ContactProfileClient contactId={contactId} />
}
