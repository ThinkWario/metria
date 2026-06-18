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
import { Input } from '@/components/ui/input'
import { Filter, Pencil, Trash2, Users, Search } from 'lucide-react'
import { toast } from 'sonner'
import { SegmentBuilder } from '@/components/crm/SegmentBuilder'
import {
  listSegments, deleteSegment, type Segment
} from '@/lib/crm-segments-api'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

export default function SegmentsClient() {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [segments, setSegments] = useState<Segment[]>([])
  const [loading, setLoading] = useState(true)
  const [editTarget, setEditTarget] = useState<Segment | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Segment | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

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
    </>
  )
}
