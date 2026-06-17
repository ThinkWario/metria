import type { Metadata } from 'next'
import PublicFormClient from './PublicFormClient'
import './form.css'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  return {
    title: 'Formulario',
    description: 'Déjanos tus datos y te contactaremos pronto.',
    robots: { index: false, follow: false },
    openGraph: {
      title: 'Formulario',
      description: 'Déjanos tus datos y te contactaremos pronto.',
      type: 'website'
    },
    alternates: { canonical: `/f/${slug}` }
  }
}

export default async function PublicFormPage({ params }: PageProps) {
  const { slug } = await params
  return <PublicFormClient slug={slug} />
}
