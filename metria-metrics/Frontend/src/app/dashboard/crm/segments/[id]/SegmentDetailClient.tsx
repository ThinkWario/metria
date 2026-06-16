'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ChevronLeft, Pencil, Users, Filter, UserCheck } from 'lucide-react'
import { toast } from 'sonner'
import { SegmentBuilder } from '@/components/crm/SegmentBuilder'
import {
  getSegment, getSegmentContacts,
  type Segment, type SegmentContact, type SegmentFilter
} from '@/lib/crm-segments-api'

// ── Filter chip labels ─────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  leadScore: 'Score',
  temperature: 'Temperatura',
  contactType: 'Tipo',
  channel: 'Canal',
  tags: 'Etiqueta',
  hasDeals: 'Oportunidades',
  isActive: 'Activo'
}

const OPERATOR_LABELS: Record<string, string> = {
  eq: '=', gt: '>', lt: '<', gte: '≥', lte: '≤',
  in: 'en', contains: 'contiene', is_true: 'sí', is_false: 'no'
}

const TEMP_LABELS: Record<string, string> = { COLD: 'Frío', WARM: 'Tibio', HOT: 'Caliente' }
const TYPE_LABELS: Record<string, string> = {
  CURIOUS: 'Curioso', QUOTING: 'Cotizando',
  READY_TO_BUY: 'Listo', POST_SALE: 'Postventa'
}

function filterChipLabel(f: SegmentFilter): string {
  const field = FIELD_LABELS[f.field] ?? f.field
  const op = OPERATOR_LABELS[f.operator] ?? f.operator
  if (f.operator === 'is_true' || f.operator === 'is_false') {
    return `${field} = ${op}`
  }
  let val = ''
  if (Array.isArray(f.value)) {
    val = f.value.join(', ')
  } else {
    const raw = String(f.value)
    if (f.field === 'temperature') val = TEMP_LABELS[raw] ?? raw
    else if (f.field === 'contactType') val = TYPE_LABELS[raw] ?? raw
    else val = raw
  }
  return `${field} ${op} ${val}`
}

// ── Temperature badge ──────────────────────────────────────────────────────────

const TEMP_STYLES: Record<string, string> = {
  HOT: 'bg-red-500/15 text-red-500 border-red-500/30',
  WARM: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
  COLD: 'bg-sky-500/15 text-sky-400 border-sky-500/30'
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function SegmentDetailClient({ id }: { id: string }) {
  const router = useRouter()

  const [segment, setSegment] = useState<Segment | null>(null)
  const [contacts, setContacts] = useState<SegmentContact[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [contactsLoading, setContactsLoading] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    fetchSegment()
  }, [mounted, id])

  useEffect(() => {
    if (!segment || !mounted) return
    fetchContacts()
  }, [segment, page, mounted])

  async function fetchSegment() {
    setLoading(true)
    try {
      const data = await getSegment(id)
      setSegment(data)
    } catch {
      toast.error('Segmento no encontrado')
      router.push('/dashboard/crm/segments')
    } finally {
      setLoading(false)
    }
  }

  async function fetchContacts() {
    setContactsLoading(true)
    try {
      const data = await getSegmentContacts(id, page)
      setContacts(data.contacts)
      setTotal(data.total)
      setTotalPages(data.totalPages)
    } catch {
      toast.error('Error al cargar contactos')
    } finally {
      setContactsLoading(false)
    }
  }

  // ── Loading skeleton ─────────────────────────────────────────────────────

  if (loading || !mounted) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-56" />
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-28 rounded-full" />
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (!segment) return null

  const segFilters = segment.filters?.filters ?? []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <Link
            href="/dashboard/crm/segments"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
          >
            <ChevronLeft className="h-4 w-4" /> Segmentos
          </Link>
          <h1 className="text-2xl font-semibold">{segment.name}</h1>
          {segment.description && (
            <p className="text-sm text-muted-foreground">{segment.description}</p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="secondary" className="flex items-center gap-1.5 text-sm py-1 px-3">
            <Users className="h-3.5 w-3.5" />
            {segment.contactCount} contacto{segment.contactCount !== 1 ? 's' : ''}
          </Badge>
          <SegmentBuilder
            trigger={
              <Button variant="outline" size="sm">
                <Pencil className="h-4 w-4 mr-1.5" />
                Editar
              </Button>
            }
            initialData={segment}
            onSave={updated => {
              setSegment(updated)
              setPage(1)
            }}
          />
        </div>
      </div>

      {/* Filter chips */}
      {segFilters.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Filter className="h-3.5 w-3.5" />
            {segment.filters.logic === 'AND' ? 'Cumple TODAS:' : 'Cumple ALGUNA:'}
          </span>
          {segFilters.map((f, i) => (
            <Badge key={i} variant="outline" className="text-xs font-normal">
              {filterChipLabel(f)}
            </Badge>
          ))}
        </div>
      )}

      {/* Contacts list */}
      <div className="space-y-2">
        {contactsLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center gap-3">
            <UserCheck className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Ningún contacto coincide con las condiciones actuales.
            </p>
          </div>
        ) : (
          contacts.map(contact => (
            <div
              key={contact.id}
              className="flex items-center gap-3 rounded-lg border px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer"
              onClick={() => router.push(`/dashboard/crm/contacts/${contact.id}`)}
            >
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarFallback className="text-xs">{initials(contact.name)}</AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{contact.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {contact.phone?.split('@')[0] ?? contact.email ?? '—'}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                {contact.leadTemperature && (
                  <Badge
                    variant="outline"
                    className={`text-xs ${TEMP_STYLES[contact.leadTemperature] ?? ''}`}
                  >
                    {TEMP_LABELS[contact.leadTemperature] ?? contact.leadTemperature}
                  </Badge>
                )}
                {contact.leadScore != null && (
                  <Badge variant="secondary" className="text-xs">
                    {contact.leadScore}/100
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  {contact.source}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {total} contactos — página {page} de {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1 || contactsLoading}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || contactsLoading}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
