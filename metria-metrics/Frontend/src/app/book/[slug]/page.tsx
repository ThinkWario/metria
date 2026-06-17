import type { Metadata } from 'next'
import BookingClient from './BookingClient'
import './booking.css'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  return {
    title: 'Reservar una cita',
    description: 'Agenda tu cita en línea. Elige el día y la hora que mejor te acomode.',
    robots: { index: false, follow: false },
    openGraph: {
      title: 'Reservar una cita',
      description: 'Agenda tu cita en línea en segundos.',
      type: 'website',
    },
    alternates: { canonical: `/book/${slug}` },
  }
}

export default async function PublicBookingPage({ params }: PageProps) {
  const { slug } = await params
  return <BookingClient slug={slug} />
}
