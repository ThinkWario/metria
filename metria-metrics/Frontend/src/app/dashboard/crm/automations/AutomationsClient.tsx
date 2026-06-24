'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription
} from '@/components/ui/sheet'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Zap, Pencil, Trash2, Play, History, Search, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { WorkflowCanvas } from '@/components/crm/WorkflowCanvas'
import {
  listWorkflows, getCatalog, deleteWorkflow, updateWorkflow, createWorkflow,
  getWorkflowRuns,
  type Workflow, type WorkflowCatalog, type WorkflowRun, type WorkflowNode
} from '@/lib/crm-automations-api'
import { fetchAPI } from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

const EMPTY_CATALOG: WorkflowCatalog = { triggers: [], actions: [] }

export default function AutomationsClient() {
  const [mounted, setMounted] = useState(false)
  const [workflows, setWorkflows] = useState<Workflow[]>([])
  const [catalog, setCatalog] = useState<WorkflowCatalog>(EMPTY_CATALOG)
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<Workflow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null)
  const [runHistoryRefresh, setRunHistoryRefresh] = useState(0)
  const [runs, setRuns] = useState<WorkflowRun[]>([])
  const [runsLoading, setRunsLoading] = useState(false)
  const [runsError, setRunsError] = useState<string | null>(null)
  const [duplicating, setDuplicating] = useState<string | null>(null)

  // Canvas state
  const [canvasOpen, setCanvasOpen] = useState(false)
  const [canvasWorkflow, setCanvasWorkflow] = useState<Workflow | null>(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    loadData()
  }, [mounted])

  useEffect(() => {
    if (!selectedWorkflowId) return
    setRunsLoading(true)
    setRunsError(null)
    setRuns([])
    getWorkflowRuns(selectedWorkflowId)
      .then(data => setRuns(data))
      .catch((err: any) => setRunsError(err?.message ?? 'Error al cargar ejecuciones'))
      .finally(() => setRunsLoading(false))
  }, [selectedWorkflowId, runHistoryRefresh])

  async function loadData() {
    setLoading(true)
    try {
      const [wfs, cat] = await Promise.all([listWorkflows(), getCatalog()])
      setWorkflows(wfs)
      setCatalog(cat)
    } catch (err: any) {
      toast.error('Error al cargar automatizaciones')
    } finally {
      setLoading(false)
    }
  }

  const triggerLabel = (type: string) =>
    catalog.triggers.find(t => t.value === type)?.label ?? type

  function openCanvasForNew() {
    setCanvasWorkflow(null)
    setCanvasOpen(true)
  }

  function openCanvasForEdit(wf: Workflow) {
    setCanvasWorkflow(wf)
    setCanvasOpen(true)
  }

  async function handleSaveFromCanvas(data: {
    name: string
    triggerType: string
    nodes: WorkflowNode[]
    isActive: boolean
  }) {
    try {
      let saved: Workflow
      if (canvasWorkflow) {
        saved = await updateWorkflow(canvasWorkflow.id, {
          name: data.name,
          triggerType: data.triggerType,
          nodes: data.nodes,
        })
        toast.success('Automatización actualizada')
      } else {
        saved = await createWorkflow({
          name: data.name,
          triggerType: data.triggerType,
          nodes: data.nodes,
          isActive: false,
        })
        toast.success('Automatización creada')
      }
      setWorkflows(prev => {
        const exists = prev.find(w => w.id === saved.id)
        if (exists) return prev.map(w => w.id === saved.id ? saved : w)
        return [saved, ...prev]
      })
      setCanvasOpen(false)
    } catch (err: any) {
      toast.error(err.message ?? 'Error al guardar automatización')
      throw err // keep canvas open on error
    }
  }

  async function handleToggle(workflow: Workflow, next: boolean) {
    // Optimistic
    setWorkflows(prev => prev.map(w => w.id === workflow.id ? { ...w, isActive: next } : w))
    try {
      await updateWorkflow(workflow.id, { isActive: next })
      toast.success(next ? 'Automatización activada' : 'Automatización pausada')
    } catch (err: any) {
      // Rollback
      setWorkflows(prev => prev.map(w => w.id === workflow.id ? { ...w, isActive: workflow.isActive } : w))
      toast.error(err.message ?? 'Error al actualizar estado')
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteWorkflow(deleteTarget.id)
      setWorkflows(prev => prev.filter(w => w.id !== deleteTarget.id))
      toast.success('Automatización eliminada')
    } catch (err: any) {
      toast.error(err.message ?? 'Error al eliminar automatización')
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  async function handleDuplicate(workflow: Workflow) {
    setDuplicating(workflow.id)
    try {
      const duplicate = await fetchAPI(`/crm/workflows/${workflow.id}/duplicate`, { method: 'POST' })
      setWorkflows(prev => [duplicate, ...prev])
      toast.success('Duplicado creado')
    } catch (err: any) {
      toast.error(err.message ?? 'Error al duplicar automatización')
    } finally {
      setDuplicating(null)
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
              <Skeleton className="h-6 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const filteredWorkflows = workflows.filter(w =>
    w.name.toLowerCase().includes(searchTerm.toLowerCase())
  )
  const selectedWorkflow = workflows.find(w => w.id === selectedWorkflowId)

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Buscar automatizaciones…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="ml-auto">
          <Button onClick={openCanvasForNew}>
            <Zap className="h-4 w-4 mr-2" />
            Nueva automatización
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {workflows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20 gap-4 text-center">
          <div className="rounded-full bg-muted p-4">
            <Zap className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">Sin automatizaciones creadas</p>
            <p className="text-sm text-muted-foreground mt-1">
              Crea tu primera automatización para disparar acciones cuando ocurra un evento.
            </p>
          </div>
          <Button variant="outline" onClick={openCanvasForNew}>
            Crear primera automatización
          </Button>
        </div>
      ) : filteredWorkflows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 gap-3 text-center">
          <p className="text-sm text-muted-foreground">Sin resultados para «{searchTerm}»</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredWorkflows.map(workflow => (
            <Card
              key={workflow.id}
              className="hover:border-primary/40 transition-colors group relative"
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full shrink-0 ${workflow.isActive ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`}
                        title={workflow.isActive ? 'Activo' : 'Inactivo'}
                      />
                      <p className="font-semibold leading-tight truncate">{workflow.name}</p>
                    </div>
                    {workflow.description && (
                      <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                        {workflow.description}
                      </p>
                    )}
                  </div>
                  {/* Action buttons */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Ver ejecuciones"
                      onClick={() => setSelectedWorkflowId(workflow.id)}
                    >
                      <History className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground"
                      title="Duplicar"
                      disabled={duplicating === workflow.id}
                      onClick={() => handleDuplicate(workflow)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Editar en canvas"
                      onClick={() => openCanvasForEdit(workflow)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteTarget(workflow)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className="flex items-center gap-1.5">
                    <Zap className="h-3 w-3" />
                    {triggerLabel(workflow.triggerType)}
                  </Badge>
                  <Badge variant="outline" className="flex items-center gap-1.5 text-muted-foreground">
                    <Play className="h-3 w-3" />
                    <span className="tabular-nums">{workflow.runCount}</span>
                    {' '}ejecucion{workflow.runCount !== 1 ? 'es' : ''}
                  </Badge>
                </div>

                <div className="flex items-center justify-between border-t pt-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={workflow.isActive}
                      onCheckedChange={next => handleToggle(workflow, next)}
                      aria-label={workflow.isActive ? 'Desactivar' : 'Activar'}
                    />
                    <span className="text-xs font-medium text-muted-foreground">
                      {workflow.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                  {workflow.lastRunAt && (
                    <span className="text-xs text-muted-foreground">
                      Última{' '}
                      {formatDistanceToNow(new Date(workflow.lastRunAt), {
                        addSuffix: true,
                        locale: es
                      })}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Visual workflow canvas */}
      <WorkflowCanvas
        open={canvasOpen}
        workflow={canvasWorkflow}
        catalog={catalog}
        onClose={() => setCanvasOpen(false)}
        onSave={handleSaveFromCanvas}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar automatización?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la automatización <strong>{deleteTarget?.name}</strong>. Esta acción
              no se puede deshacer.
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

      {/* Execution history sheet */}
      <Sheet
        open={!!selectedWorkflowId}
        onOpenChange={open => { if (!open) { setSelectedWorkflowId(null); setRuns([]) } }}
      >
        <SheetContent className="w-full sm:max-w-lg flex flex-col gap-0 p-0">
          <SheetHeader className="px-6 pt-6 pb-4 border-b">
            <SheetTitle className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Historial de ejecuciones
            </SheetTitle>
            {selectedWorkflow && (
              <SheetDescription>{selectedWorkflow.name}</SheetDescription>
            )}
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            {runsLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2 rounded-lg border p-3">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="h-14 w-full" />
                </div>
              ))
            ) : runsError ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <p className="text-sm text-destructive">{runsError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRunHistoryRefresh(prev => prev + 1)}
                >
                  Reintentar
                </Button>
              </div>
            ) : runs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <div className="rounded-full bg-muted p-3">
                  <History className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">Sin ejecuciones aún</p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  Activa un workflow para ver historial de ejecuciones aquí.
                </p>
              </div>
            ) : (
              runs.map(run => (
                <RunCard key={run.id} run={run} />
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const RUN_STATUS: Record<string, { label: string; className: string }> = {
  RUNNING:   { label: 'Ejecutando', className: 'border-blue-200 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300' },
  WAITING:   { label: 'En espera',  className: 'border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  COMPLETED: { label: 'Completado', className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
  FAILED:    { label: 'Fallido',    className: 'border-red-200 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300' },
}

function RunCard({ run }: { run: WorkflowRun }) {
  const meta = RUN_STATUS[run.status] ?? { label: run.status, className: '' }
  return (
    <div className="rounded-lg border p-3 space-y-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${meta.className}`}>
          {meta.label}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(run.createdAt), { addSuffix: true, locale: es })}
        </span>
      </div>
      {run.log != null && <LogPreview log={run.log} />}
    </div>
  )
}

function LogPreview({ log }: { log: unknown }) {
  let content: string
  if (Array.isArray(log)) {
    content = (log as string[]).slice(0, 8).join('\n')
  } else if (typeof log === 'string') {
    content = log.slice(0, 400)
  } else {
    content = JSON.stringify(log, null, 2).slice(0, 400)
  }
  return (
    <pre className="text-xs bg-muted rounded-md p-2 overflow-auto max-h-24 text-muted-foreground whitespace-pre-wrap break-all leading-relaxed">
      {content}
    </pre>
  )
}
