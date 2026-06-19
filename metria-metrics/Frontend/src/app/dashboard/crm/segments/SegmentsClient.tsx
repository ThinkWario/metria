'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Filter, Pencil, Trash2, Users, Search, RefreshCw, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { SegmentBuilder } from '@/components/crm/SegmentBuilder'
import {
  listSegments, deleteSegment, getSegmentContacts,
  type Segment, type SegmentContact
} from '@/lib/crm-segments-api'
import { fetchAPI } from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

// ── Status helpers ─────────────────────────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
  LEAD: 'Lead',
  PROSPECT: 'Prospecto',
  CUSTOMER: 'Cliente',
  VIP: 'VIP',
  CHURNED: 'Inactivo',
}

const STATUS_CLASSES: Record<string, string> = {
  LEAD: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  PROSPECT: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  CUSTOMER: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  VIP: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  CHURNED: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map(n => n[0] ?? '')
    .join('')
    .toUpperCase()
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function SegmentsClient() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [segments, setSegments] = useState<Segment[]>([])
  const [loading, setLoading] = useState(true)
  const [editTarget, setEditTarget] = useState<Segment | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Segment | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  // Recalculate state
  const [recalculating, setRecalculating] = useState<string | null>(null)

  // Duplicate state
  const [duplicating, setDuplicating] = useState<string | null>(null)

  // Contacts sheet state
  const [selectedSegment, setSelectedSegment] = useState<Segment | null>(null)
  const [contacts, setContacts] = useState<SegmentContact[]>([])
  const [contactsPage, setContactsPage] = useState(1)
  const [contactsTotal, setContactsTotal] = useState(0)
  const [contactsTotalPages, setContactsTotalPages] = useState(1)
  const [contactsLoading, setContactsLoading] = useState(false)
  const [contactsError, setContactsError] = useState<string | null>(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    fetchSegments()
  }, [mounted])

  async function fetchSegments() {
    setLoading(true)
    try {
      const data = await listSegments()
      setSegments(data)
    } catch (err: any) {
      toast.error('Error al cargar segmentos')
    } finally {
      setLoading(false)
    }
  }

  function handleSaved(segment: Segment) {
    setSegments(prev => {
      const exists = prev.find(s => s.id === segment.id)
      if (exists) return prev.map(s => s.id === segment.id ? segment : s)
      return [...prev, segment]
    })
    setEditTarget(null)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteSegment(deleteTarget.id)
      setSegments(prev => prev.filter(s => s.id !== deleteTarget.id))
      toast.success('Segmento eliminado')
    } catch (err: any) {
      toast.error(err.message ?? 'Error al eliminar segmento')
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  async function handleRecalculate(segment: Segment) {
    setRecalculating(segment.id)
    try {
      const result = await fetchAPI(`/crm/segments/${segment.id}/recalculate`, { method: 'POST' })
      const newCount: number = result.contactCount
      setSegments(prev =>
        prev.map(s => s.id === segment.id ? { ...s, contactCount: newCount } : s)
      )
      toast.success(`Segmento recalculado: ${newCount} contacto${newCount !== 1 ? 's' : ''}`)
    } catch (err: any) {
      toast.error(err.message ?? 'Error al recalcular segmento')
    } finally {
      setRecalculating(null)
    }
  }

  async function handleDuplicate(segment: Segment) {
    setDuplicating(segment.id)
    try {
      const duplicate = await fetchAPI(`/crm/segments/${segment.id}/duplicate`, { method: 'POST' })
      setSegments(prev => [duplicate, ...prev])
      toast.success('Duplicado creado')
    } catch (err: any) {
      toast.error(err.message ?? 'Error al duplicar segmento')
    } finally {
      setDuplicating(null)
    }
  }

  async function fetchContacts(segmentId: string, page: number) {
    setContactsLoading(true)
    setContactsError(null)
    try {
      const data = await getSegmentContacts(segmentId, page, 20)
      setContacts(data.contacts)
      setContactsTotal(data.total)
      setContactsTotalPages(data.totalPages)
      setContactsPage(data.page)
    } catch (err: any) {
      setContactsError(err.message ?? 'Error al cargar contactos')
    } finally {
      setContactsLoading(false)
    }
  }

  function handleOpenContacts(segment: Segment) {
    setSelectedSegment(segment)
    setContacts([])
    setContactsPage(1)
    setContactsError(null)
    fetchContacts(segment.id, 1)
  }

  function handleSheetClose(open: boolean) {
    if (!open) {
      setSelectedSegment(null)
      setContacts([])
      setContactsError(null)
    }
  }

  if (!mounted || loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-full mt-1" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-6 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const filteredSegments = segments.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Buscar segmentos…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="ml-auto">
          <SegmentBuilder
            trigger={
              <Button>
                <Filter className="h-4 w-4 mr-2" />
                Nuevo Segmento
              </Button>
            }
            onSave={handleSaved}
          />
        </div>
      </div>

      {/* Empty state */}
      {segments.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20 gap-4 text-center">
          <div className="rounded-full bg-muted p-4">
            <Filter className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">Sin segmentos creados</p>
            <p className="text-sm text-muted-foreground mt-1">
              Crea tu primer segmento para agrupar contactos por condiciones.
            </p>
          </div>
          <SegmentBuilder
            trigger={<Button variant="outline">Crear primer segmento</Button>}
            onSave={handleSaved}
          />
        </div>
      ) : filteredSegments.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 gap-3 text-center">
          <p className="text-sm text-muted-foreground">Sin resultados para «{searchTerm}»</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredSegments.map(segment => (
            <Card
              key={segment.id}
              className="cursor-pointer hover:border-primary/40 transition-colors group relative"
              onClick={() => router.push(`/dashboard/crm/segments/${segment.id}`)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-tight truncate">{segment.name}</p>
                    {segment.description && (
                      <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                        {segment.description}
                      </p>
                    )}
                  </div>
                  {/* Action buttons — stop propagation so card click doesn't fire */}
                  <div
                    className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    onClick={e => e.stopPropagation()}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground"
                      title="Ver contactos"
                      onClick={() => handleOpenContacts(segment)}
                    >
                      <Users className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground"
                      title="Recalcular"
                      disabled={recalculating === segment.id}
                      onClick={() => handleRecalculate(segment)}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${recalculating === segment.id ? 'animate-spin' : ''}`} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground"
                      title="Duplicar"
                      disabled={duplicating === segment.id}
                      onClick={() => handleDuplicate(segment)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <SegmentBuilder
                      key={segment.id}
                      trigger={
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      }
                      initialData={segment}
                      onSave={handleSaved}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteTarget(segment)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex items-center gap-3">
                <Badge variant="secondary" className="flex items-center gap-1.5">
                  <Users className="h-3 w-3" />
                  {segment.contactCount} contacto{segment.contactCount !== 1 ? 's' : ''}
                </Badge>
                {segment.lastCalculatedAt && (
                  <span className="text-xs text-muted-foreground">
                    Actualizado{' '}
                    {formatDistanceToNow(new Date(segment.lastCalculatedAt), {
                      addSuffix: true,
                      locale: es
                    })}
                  </span>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar segmento?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará el segmento <strong>{deleteTarget?.name}</strong>. Los contactos
              no serán afectados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Contacts Sheet */}
      <Sheet open={!!selectedSegment} onOpenChange={handleSheetClose}>
        <SheetContent className="w-full sm:max-w-lg flex flex-col gap-0 p-0">
          <SheetHeader className="px-6 py-4 border-b">
            <SheetTitle className="truncate">{selectedSegment?.name}</SheetTitle>
            <SheetDescription>
              {contactsLoading && contacts.length === 0
                ? 'Cargando contactos…'
                : `${contactsTotal} contacto${contactsTotal !== 1 ? 's' : ''}`}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            {/* Loading skeleton */}
            {contactsLoading && contacts.length === 0 &&
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                </div>
              ))
            }

            {/* Error state */}
            {contactsError && (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                <p className="text-sm text-destructive">{contactsError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => selectedSegment && fetchContacts(selectedSegment.id, contactsPage)}
                >
                  Reintentar
                </Button>
              </div>
            )}

            {/* Empty state */}
            {!contactsLoading && !contactsError && contacts.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
                <Users className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Este segmento no tiene contactos con los filtros actuales
                </p>
              </div>
            )}

            {/* Contact rows */}
            {contacts.map(contact => {
              const statusClass = STATUS_CLASSES[contact.status] ?? STATUS_CLASSES.CHURNED
              const statusLabel = STATUS_LABELS[contact.status] ?? contact.status
              const visibleTags = contact.tags.slice(0, 3)
              const extraTags = contact.tags.length - visibleTags.length

              return (
                <div key={contact.id} className="flex items-start gap-3 py-1">
                  {/* Avatar with initials */}
                  <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0 text-xs font-semibold text-muted-foreground">
                    {getInitials(contact.name)}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{contact.name}</span>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusClass}`}>
                        {statusLabel}
                      </span>
                    </div>
                    {(contact.phone || contact.email) && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {contact.phone ?? contact.email}
                      </p>
                    )}
                    {/* Tags + deal count */}
                    <div className="flex items-center gap-1 flex-wrap mt-1">
                      {visibleTags.map(tag => (
                        <span
                          key={tag.id}
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-muted text-muted-foreground"
                        >
                          {tag.name}
                        </span>
                      ))}
                      {extraTags > 0 && (
                        <span className="text-xs text-muted-foreground">+{extraTags} más</span>
                      )}
                      {contact._count.deals > 0 && (
                        <span className="ml-auto text-xs text-muted-foreground">
                          {contact._count.deals} deal{contact._count.deals !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Pagination */}
          {contactsTotalPages > 1 && !contactsLoading && !contactsError && (
            <div className="px-6 py-3 border-t flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                disabled={contactsPage <= 1}
                onClick={() => {
                  const newPage = contactsPage - 1
                  selectedSegment && fetchContacts(selectedSegment.id, newPage)
                }}
              >
                Anterior
              </Button>
              <span className="text-xs text-muted-foreground">
                {contactsPage} / {contactsTotalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={contactsPage >= contactsTotalPages}
                onClick={() => {
                  const newPage = contactsPage + 1
                  selectedSegment && fetchContacts(selectedSegment.id, newPage)
                }}
              >
                Siguiente
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
