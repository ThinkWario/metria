import type { Metadata } from 'next'
import SegmentDetailClient from './SegmentDetailClient'

export const metadata: Metadata = {
  title: 'Segmento | CRM | Metria'
}

export default async function SegmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <SegmentDetailClient id={id} />
}
