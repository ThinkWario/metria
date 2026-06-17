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
import { Zap, Pencil, Trash2, Play } from 'lucide-react'
import { toast } from 'sonner'
import { AutomationBuilder } from '@/components/crm/AutomationBuilder'
import {
  listWorkflows, getCatalog, deleteWorkflow, updateWorkflow,
  type Workflow, type WorkflowCatalog
} from '@/lib/crm-automations-api'
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

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    loadData()
  }, [mounted])

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

  function handleSaved(workflow: Workflow) {
    setWorkflows(prev => {
      const exists = prev.find(w => w.id === workflow.id)
      if (exists) return prev.map(w => w.id === workflow.id ? workflow : w)
      return [workflow, ...prev]
    })
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

  return (
    <>
      {/* Toolbar */}
      <div className="flex justify-end">
        <AutomationBuilder
          catalog={catalog}
          trigger={
            <Button>
              <Zap className="h-4 w-4 mr-2" />
              Nueva automatización
            </Button>
          }
          onSave={handleSaved}
        />
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
          <AutomationBuilder
            catalog={catalog}
            trigger={<Button variant="outline">Crear primera automatización</Button>}
            onSave={handleSaved}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {workflows.map(workflow => (
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
                    <AutomationBuilder
                      key={workflow.id}
                      catalog={catalog}
                      trigger={
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      }
                      initialData={workflow}
                      onSave={handleSaved}
                    />
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
    </>
  )
}
