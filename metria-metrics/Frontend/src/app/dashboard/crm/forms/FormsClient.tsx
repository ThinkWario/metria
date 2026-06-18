'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import {
  FileText, Pencil, Trash2, Inbox, Copy, Check, ExternalLink, Search
} from 'lucide-react'
import { toast } from 'sonner'
import { FormBuilder } from '@/components/crm/FormBuilder'
import { listForms, deleteForm, updateForm, type Form } from '@/lib/forms-api'
import { fetchAPI } from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface FormSubmission {
  id: string
  contactId: string
  contact: { name?: string; phone?: string; email?: string }
  data: Record<string, string>
  createdAt: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'hace un momento'
  if (minutes < 60) return `hace ${minutes} minuto${minutes !== 1 ? 's' : ''}`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `hace ${hours} hora${hours !== 1 ? 's' : ''}`
  const days = Math.floor(hours / 24)
  return `hace ${days} día${days !== 1 ? 's' : ''}`
}

function publicUrl(slug: string): string {
  if (typeof window === 'undefined') return `/f/${slug}`
  return `${window.location.origin}/f/${slug}`
}

export default function FormsClient() {
  const [mounted, setMounted] = useState(false)
  const [forms, setForms] = useState<Form[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Form | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null)
  const [submissions, setSubmissions] = useState<FormSubmission[]>([])
  const [submissionsLoading, setSubmissionsLoading] = useState(false)
  const [submissionsError, setSubmissionsError] = useState<string | null>(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    fetchForms()
  }, [mounted])

  async function fetchForms() {
    setLoading(true)
    setError(null)
    try {
      setForms(await listForms())
    } catch (err: any) {
      setError(err?.message ?? 'Error al cargar formularios')
    } finally {
      setLoading(false)
    }
  }

  function handleSaved(form: Form) {
    setForms(prev => {
      const exists = prev.find(f => f.id === form.id)
      if (exists) return prev.map(f => (f.id === form.id ? form : f))
      return [form, ...prev]
    })
  }

  async function copyUrl(form: Form) {
    const url = publicUrl(form.slug)
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(form.id)
      toast.success('Enlace copiado')
      setTimeout(() => setCopiedId(c => (c === form.id ? null : c)), 1800)
    } catch {
      toast.error('No se pudo copiar el enlace')
    }
  }

  // Optimistic active toggle — flip immediately, roll back on failure.
  async function toggleActive(form: Form, next: boolean) {
    setTogglingId(form.id)
    setForms(prev => prev.map(f => (f.id === form.id ? { ...f, isActive: next } : f)))
    try {
      const saved = await updateForm(form.id, { isActive: next })
      setForms(prev => prev.map(f => (f.id === form.id ? saved : f)))
    } catch (err: any) {
      setForms(prev => prev.map(f => (f.id === form.id ? { ...f, isActive: form.isActive } : f)))
      toast.error(err?.message ?? 'No se pudo cambiar el estado')
    } finally {
      setTogglingId(t => (t === form.id ? null : t))
    }
  }

  async function openSubmissions(form: Form) {
    setSelectedFormId(form.id)
    setSubmissions([])
    setSubmissionsError(null)
    setSubmissionsLoading(true)
    try {
      const data: FormSubmission[] = await fetchAPI(`/crm/forms/${form.id}/submissions`)
      setSubmissions(data)
    } catch (err: any) {
      setSubmissionsError(err?.message ?? 'Error al cargar respuestas')
    } finally {
      setSubmissionsLoading(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteForm(deleteTarget.id)
      setForms(prev => prev.filter(f => f.id !== deleteTarget.id))
      toast.success('Formulario eliminado')
    } catch (err: any) {
      toast.error(err?.message ?? 'Error al eliminar formulario')
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (!mounted || loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-full mt-1" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-9 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20 gap-4 text-center">
        <div className="rounded-full bg-destructive/10 p-4">
          <FileText className="h-8 w-8 text-destructive" />
        </div>
        <div>
          <p className="font-medium">No pudimos cargar tus formularios</p>
          <p className="text-sm text-muted-foreground mt-1">{error}</p>
        </div>
        <Button variant="outline" onClick={fetchForms}>Reintentar</Button>
      </div>
    )
  }

  const filteredForms = forms.filter(f =>
    f.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Buscar formularios…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="ml-auto">
          <FormBuilder
            trigger={
              <Button>
                <FileText className="h-4 w-4 mr-2" />
                Nuevo formulario
              </Button>
            }
            onSave={handleSaved}
          />
        </div>
      </div>

      {/* Empty state */}
      {forms.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20 gap-4 text-center">
          <div className="rounded-full bg-muted p-4">
            <Inbox className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">Aún no tienes formularios</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Crea tu primer formulario, compártelo con un enlace y captura leads
              directo en tu CRM.
            </p>
          </div>
          <FormBuilder
            trigger={<Button variant="outline">Crear primer formulario</Button>}
            onSave={handleSaved}
          />
        </div>
      ) : filteredForms.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 gap-3 text-center">
          <p className="text-sm text-muted-foreground">Sin resultados para «{searchTerm}»</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredForms.map(form => {
            const url = publicUrl(form.slug)
            return (
              <Card key={form.id} className="group relative flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold leading-tight truncate">{form.name}</p>
                        <Badge variant={form.isActive ? 'default' : 'secondary'} className="shrink-0">
                          {form.isActive ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </div>
                      {form.description && (
                        <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                          {form.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
                      <FormBuilder
                        initialData={form}
                        trigger={
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Editar formulario">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        }
                        onSave={handleSaved}
                      />
                      <Button
                        variant="ghost" size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteTarget(form)}
                        aria-label="Eliminar formulario"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="flex flex-col gap-3 mt-auto">
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="flex items-center gap-1.5">
                      <Inbox className="h-3 w-3" />
                      {form.submissionCount} envío{form.submissionCount !== 1 ? 's' : ''}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                      onClick={() => openSubmissions(form)}
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Respuestas ({form.submissionCount})
                    </Button>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer ml-auto">
                      <Switch
                        checked={form.isActive}
                        disabled={togglingId === form.id}
                        onCheckedChange={(checked: boolean) => toggleActive(form, checked)}
                        aria-label="Activar o desactivar formulario"
                      />
                      {form.isActive ? 'Publicado' : 'Sin publicar'}
                    </label>
                  </div>

                  {/* Public URL row */}
                  <div className="flex items-center gap-1.5 rounded-md border bg-muted/40 pl-3 pr-1.5 py-1.5">
                    <span className="text-xs text-muted-foreground truncate flex-1 font-mono">
                      /f/{form.slug}
                    </span>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                      onClick={() => copyUrl(form)}
                      aria-label="Copiar enlace público"
                    >
                      {copiedId === form.id
                        ? <Check className="h-3.5 w-3.5 text-emerald-500" />
                        : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                      asChild
                      aria-label="Abrir formulario en nueva pestaña"
                    >
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Submissions Sheet */}
      <Sheet open={!!selectedFormId} onOpenChange={open => !open && setSelectedFormId(null)}>
        <SheetContent className="w-[420px] sm:w-[540px] flex flex-col overflow-hidden">
          <SheetHeader className="shrink-0">
            <SheetTitle>
              Respuestas — {forms.find(f => f.id === selectedFormId)?.name ?? ''}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4 flex-1 overflow-y-auto space-y-3 pr-1">
            {submissionsLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="pt-4 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                    <Skeleton className="h-12 w-full" />
                  </CardContent>
                </Card>
              ))
            ) : submissionsError ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <div className="rounded-full bg-destructive/10 p-3">
                  <FileText className="h-6 w-6 text-destructive" />
                </div>
                <p className="text-sm text-muted-foreground">{submissionsError}</p>
              </div>
            ) : submissions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <div className="rounded-full bg-muted p-3">
                  <Inbox className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Aún no hay respuestas para este formulario
                </p>
              </div>
            ) : (
              submissions.map(sub => (
                <Card key={sub.id}>
                  <CardContent className="pt-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-sm leading-tight">
                        {sub.contact?.name || 'Contacto desconocido'}
                      </p>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {relativeTime(sub.createdAt)}
                      </span>
                    </div>
                    {(sub.contact?.phone || sub.contact?.email) && (
                      <p className="text-xs text-muted-foreground">
                        {[sub.contact.phone, sub.contact.email].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {Object.keys(sub.data).length > 0 && (
                      <dl className="text-xs space-y-1 pt-1 border-t">
                        {Object.entries(sub.data).map(([k, v]) => (
                          <div key={k} className="flex gap-2">
                            <dt className="text-muted-foreground shrink-0">{k}:</dt>
                            <dd className="break-all">{String(v) || '—'}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar formulario?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <strong>{deleteTarget?.name}</strong> y su enlace dejará de funcionar.
              Los leads ya capturados se conservan en tu CRM.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Eliminando…' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
