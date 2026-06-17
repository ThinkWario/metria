'use client'

import { useState, useEffect } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Plus, X, ArrowUp, ArrowDown, Zap, GitBranch } from 'lucide-react'
import {
  type Workflow, type WorkflowNode, type WorkflowCatalog, type CatalogAction,
  createWorkflow, updateWorkflow
} from '@/lib/crm-automations-api'
import { toast } from 'sonner'

// ── Field configuration ────────────────────────────────────────────────────────

const NUMERIC_FIELDS = new Set(['dueInHours', 'hours', 'minutes'])

const ENUM_FIELDS: Record<string, { value: string; label: string }[]> = {
  priority: [
    { value: 'LOW', label: 'Baja' },
    { value: 'MEDIUM', label: 'Media' },
    { value: 'HIGH', label: 'Alta' },
    { value: 'URGENT', label: 'Urgente' }
  ],
  status: [
    { value: 'LEAD', label: 'Lead' },
    { value: 'PROSPECT', label: 'Prospecto' },
    { value: 'CUSTOMER', label: 'Cliente' },
    { value: 'VIP', label: 'VIP' },
    { value: 'CHURNED', label: 'Perdido' }
  ],
  method: [
    { value: 'GET', label: 'GET' },
    { value: 'POST', label: 'POST' }
  ],
  op: [
    { value: 'eq', label: '= igual a' },
    { value: 'neq', label: '≠ distinto de' },
    { value: 'gt', label: '> mayor que' },
    { value: 'gte', label: '≥ mayor o igual' },
    { value: 'lt', label: '< menor que' },
    { value: 'lte', label: '≤ menor o igual' },
    { value: 'contains', label: 'contiene' },
    { value: 'is_true', label: 'es verdadero' },
    { value: 'is_false', label: 'es falso' }
  ]
}

const FIELD_LABELS: Record<string, string> = {
  title: 'Título',
  text: 'Texto',
  priority: 'Prioridad',
  dueInHours: 'Vence en (horas)',
  status: 'Nuevo estado',
  name: 'Nombre',
  color: 'Color',
  stageId: 'ID de etapa',
  url: 'URL',
  method: 'Método',
  hours: 'Horas',
  minutes: 'Minutos',
  field: 'Campo',
  op: 'Operador',
  value: 'Valor'
}

const FIELD_PLACEHOLDERS: Record<string, string> = {
  title: 'ej. Llamar al lead',
  text: 'Contenido de la nota...',
  name: 'ej. caliente',
  color: '#22c55e',
  stageId: 'ID de la etapa destino',
  url: 'https://...',
  field: 'ej. leadScore',
  value: 'Valor a comparar'
}

function fieldLabel(f: string) { return FIELD_LABELS[f] ?? f }

// ── Node row ───────────────────────────────────────────────────────────────────

interface NodeRowProps {
  node: WorkflowNode
  index: number
  total: number
  actions: CatalogAction[]
  onChange: (index: number, updated: WorkflowNode) => void
  onRemove: (index: number) => void
  onMove: (index: number, dir: -1 | 1) => void
}

function NodeRow({ node, index, total, actions, onChange, onRemove, onMove }: NodeRowProps) {
  const actionMeta = actions.find(a => a.value === node.type)
  const fields = actionMeta?.fields ?? []
  const isBranch = node.type === 'branch'

  function handleTypeChange(type: string) {
    onChange(index, { type, config: {} })
  }

  function handleConfigChange(field: string, value: any) {
    onChange(index, { ...node, config: { ...node.config, [field]: value } })
  }

  return (
    <div className="rounded-lg border bg-card p-3 space-y-3">
      {/* Header row: index badge, type select, reorder + remove */}
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold tabular-nums">
          {index + 1}
        </span>
        <Select value={node.type} onValueChange={handleTypeChange}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Elige una acción" />
          </SelectTrigger>
          <SelectContent>
            {actions.map(a => (
              <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground"
            disabled={index === 0}
            onClick={() => onMove(index, -1)}
            title="Subir"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground"
            disabled={index === total - 1}
            onClick={() => onMove(index, 1)}
            title="Bajar"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button" variant="ghost" size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={() => onRemove(index)}
            title="Eliminar"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Branch hint */}
      {isBranch && (
        <div className="flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
          <GitBranch className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>Condición (filtro): si la condición es falsa, la ejecución se detiene.</span>
        </div>
      )}

      {/* Config fields */}
      {fields.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-8">
          {fields.map(field => {
            const value = node.config[field] ?? ''
            const enumOptions = ENUM_FIELDS[field]
            const isNumeric = NUMERIC_FIELDS.has(field)

            return (
              <div key={field} className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{fieldLabel(field)}</Label>
                {enumOptions ? (
                  <Select
                    value={String(value)}
                    onValueChange={v => handleConfigChange(field, v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar" />
                    </SelectTrigger>
                    <SelectContent>
                      {enumOptions.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : field === 'text' ? (
                  <Textarea
                    rows={2}
                    placeholder={FIELD_PLACEHOLDERS[field] ?? ''}
                    value={String(value)}
                    onChange={e => handleConfigChange(field, e.target.value)}
                  />
                ) : (
                  <Input
                    type={isNumeric ? 'number' : 'text'}
                    placeholder={FIELD_PLACEHOLDERS[field] ?? ''}
                    value={String(value)}
                    onChange={e =>
                      handleConfigChange(
                        field,
                        isNumeric ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value
                      )
                    }
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface AutomationBuilderProps {
  trigger: React.ReactNode
  catalog: WorkflowCatalog
  initialData?: Workflow
  onSave: (workflow: Workflow) => void
}

export function AutomationBuilder({ trigger, catalog, initialData, onSave }: AutomationBuilderProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(initialData?.name ?? '')
  const [description, setDescription] = useState(initialData?.description ?? '')
  const [triggerType, setTriggerType] = useState(initialData?.triggerType ?? '')
  const [stageId, setStageId] = useState<string>(initialData?.triggerConfig?.stageId ?? '')
  const [nodes, setNodes] = useState<WorkflowNode[]>(initialData?.nodes ?? [])
  const [saving, setSaving] = useState(false)

  // Reset form when dialog opens with (possibly updated) initialData
  useEffect(() => {
    if (open) {
      setName(initialData?.name ?? '')
      setDescription(initialData?.description ?? '')
      setTriggerType(initialData?.triggerType ?? '')
      setStageId(initialData?.triggerConfig?.stageId ?? '')
      setNodes(initialData?.nodes ?? [])
    }
  }, [open, initialData])

  const defaultActionType = catalog.actions[0]?.value ?? ''

  function addNode() {
    setNodes(prev => [...prev, { type: defaultActionType, config: {} }])
  }

  function updateNode(index: number, updated: WorkflowNode) {
    setNodes(prev => prev.map((n, i) => i === index ? updated : n))
  }

  function removeNode(index: number) {
    setNodes(prev => prev.filter((_, i) => i !== index))
  }

  function moveNode(index: number, dir: -1 | 1) {
    setNodes(prev => {
      const target = index + dir
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  async function handleSave() {
    if (!name.trim()) { toast.error('El nombre es obligatorio'); return }
    if (!triggerType) { toast.error('Selecciona un disparador'); return }
    if (nodes.length === 0) { toast.error('Agrega al menos una acción'); return }

    setSaving(true)
    try {
      const triggerConfig =
        triggerType === 'DEAL_STAGE_CHANGED' && stageId.trim()
          ? { stageId: stageId.trim() }
          : undefined

      let saved: Workflow
      if (initialData) {
        saved = await updateWorkflow(initialData.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          triggerType,
          triggerConfig,
          nodes
        })
      } else {
        saved = await createWorkflow({
          name: name.trim(),
          description: description.trim() || undefined,
          triggerType,
          triggerConfig,
          nodes
        })
      }
      toast.success(initialData ? 'Automatización actualizada' : 'Automatización creada')
      onSave(saved)
      setOpen(false)
    } catch (err: any) {
      toast.error(err.message ?? 'Error al guardar automatización')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <span onClick={() => setOpen(true)} className="cursor-pointer">
        {trigger}
      </span>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{initialData ? 'Editar automatización' : 'Nueva automatización'}</DialogTitle>
            <DialogDescription>
              Define el evento disparador y las acciones que se ejecutarán en orden.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="auto-name">Nombre *</Label>
              <Input
                id="auto-name"
                placeholder="ej. Crear tarea al ganar un deal"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="auto-desc">Descripción</Label>
              <Textarea
                id="auto-desc"
                placeholder="Descripción opcional..."
                rows={2}
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>

            <Separator />

            {/* Trigger */}
            <div className="space-y-1.5">
              <Label>Disparador (cuándo) *</Label>
              <Select value={triggerType} onValueChange={setTriggerType}>
                <SelectTrigger>
                  <SelectValue placeholder="Elige el evento que dispara la automatización" />
                </SelectTrigger>
                <SelectContent>
                  {catalog.triggers.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {triggerType === 'DEAL_STAGE_CHANGED' && (
                <div className="pt-2 space-y-1.5">
                  <Label className="text-xs text-muted-foreground">ID de etapa (opcional)</Label>
                  <Input
                    placeholder="Limita a una etapa específica..."
                    value={stageId}
                    onChange={e => setStageId(e.target.value)}
                  />
                </div>
              )}
            </div>

            <Separator />

            {/* Actions / nodes */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Acciones</Label>
                {nodes.length > 0 && (
                  <Badge variant="secondary" className="tabular-nums">
                    {nodes.length} paso{nodes.length !== 1 ? 's' : ''}
                  </Badge>
                )}
              </div>

              {nodes.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-8 gap-2 text-center">
                  <Zap className="h-6 w-6 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Sin acciones todavía. Agrega la primera acción.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {nodes.map((node, i) => (
                    <NodeRow
                      key={i}
                      node={node}
                      index={i}
                      total={nodes.length}
                      actions={catalog.actions}
                      onChange={updateNode}
                      onRemove={removeNode}
                      onMove={moveNode}
                    />
                  ))}
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addNode}
                disabled={catalog.actions.length === 0}
                className="w-full border-dashed"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Agregar acción
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : initialData ? 'Guardar cambios' : 'Crear automatización'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
