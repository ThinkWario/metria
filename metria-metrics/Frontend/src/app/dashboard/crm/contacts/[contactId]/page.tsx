import type { Metadata } from 'next'
import ContactProfileClient from './ContactProfileClient'

export const metadata: Metadata = {
  title: 'Perfil de Contacto | Metria',
}

export default function ContactProfilePage({ params }: { params: { contactId: string } }) {
  return <ContactProfileClient contactId={params.contactId} />
}
