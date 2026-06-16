'use client'

import { useState, useEffect, useCallback } from 'react'
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, Users } from 'lucide-react'
import {
  type SegmentFilter, type SegmentFilters, type FilterField,
  type FilterOperator, type Segment, previewSegmentCount, createSegment, updateSegment
} from '@/lib/crm-segments-api'
import { toast } from 'sonner'

// ── Field / operator configuration ─────────────────────────────────────────────

const FIELD_OPTIONS: { value: FilterField; label: string; type: 'numeric' | 'string' | 'boolean' }[] = [
  { value: 'leadScore', label: 'Score del lead', type: 'numeric' },
  { value: 'temperature', label: 'Temperatura', type: 'string' },
  { value: 'contactType', label: 'Tipo de contacto', type: 'string' },
  { value: 'channel', label: 'Canal de origen', type: 'string' },
  { value: 'hasDeals', label: 'Tiene oportunidades', type: 'boolean' }
]

const OPERATOR_OPTIONS: Record<string, { value: FilterOperator; label: string }[]> = {
  numeric: [
    { value: 'eq', label: 'es igual a' },
    { value: 'gt', label: 'mayor que' },
    { value: 'lt', label: 'menor que' },
    { value: 'gte', label: 'mayor o igual que' },
    { value: 'lte', label: 'menor o igual que' }
  ],
  string: [
    { value: 'eq', label: 'es' },
    { value: 'contains', label: 'contiene' },
    { value: 'in', label: 'está en (separado por comas)' }
  ],
  boolean: [
    { value: 'is_true', label: 'sí' },
    { value: 'is_false', label: 'no' }
  ]
}

const TEMPERATURE_VALUES = ['COLD', 'WARM', 'HOT']
const CONTACT_TYPE_VALUES = ['CURIOUS', 'QUOTING', 'READY_TO_BUY', 'POST_SALE']

function defaultOperator(type: 'numeric' | 'string' | 'boolean'): FilterOperator {
  if (type === 'numeric') return 'gt'
  if (type === 'boolean') return 'is_true'
  return 'eq'
}

// ── Sub-components ─────────────────────────────────────────────────────────────

interface FilterRowProps {
  filter: SegmentFilter
  index: number
  onChange: (index: number, updated: Partial<SegmentFilter>) => void
  onRemove: (index: number) => void
}

function FilterRow({ filter, index, onChange, onRemove }: FilterRowProps) {
  const fieldMeta = FIELD_OPTIONS.find(f => f.value === filter.field)
  const fieldType = fieldMeta?.type ?? 'string'
  const operators = OPERATOR_OPTIONS[fieldType]
  const needsValue = filter.operator !== 'is_true' && filter.operator !== 'is_false'

  const showSelect =
    (filter.field === 'temperature' && filter.operator === 'eq') ||
    (filter.field === 'contactType' && filter.operator === 'eq')

  const selectValues =
    filter.field === 'temperature' ? TEMPERATURE_VALUES :
    filter.field === 'contactType' ? CONTACT_TYPE_VALUES : []

  const TEMP_LABELS: Record<string, string> = { COLD: 'Frío', WARM: 'Tibio', HOT: 'Caliente' }
  const TYPE_LABELS: Record<string, string> = {
    CURIOUS: 'Curioso', QUOTING: 'Cotizando',
    READY_TO_BUY: 'Listo para comprar', POST_SALE: 'Postventa'
  }

  function handleFieldChange(field: FilterField) {
    const meta = FIELD_OPTIONS.find(f => f.value === field)
    const type = meta?.type ?? 'string'
    onChange(index, { field, operator: defaultOperator(type), value: '' })
  }

  function handleOperatorChange(operator: FilterOperator) {
    onChange(index, { operator, value: '' })
  }

  function handleValueChange(value: string) {
    if (filter.operator === 'in') {
      onChange(index, { value: value.split(',').map(v => v.trim()).filter(Boolean) })
    } else {
      onChange(index, { value })
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Select value={filter.field} onValueChange={handleFieldChange}>
        <SelectTrigger className="w-44">
          <SelectValue placeholder="Campo" />
        </SelectTrigger>
        <SelectContent>
          {FIELD_OPTIONS.map(f => (
            <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filter.operator} onValueChange={handleOperatorChange}>
        <SelectTrigger className="w-44">
          <SelectValue placeholder="Operador" />
        </SelectTrigger>
        <SelectContent>
          {operators.map(op => (
            <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {needsValue && showSelect && (
        <Select
          value={String(filter.value)}
          onValueChange={v => onChange(index, { value: v })}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Valor" />
          </SelectTrigger>
          <SelectContent>
            {selectValues.map(v => (
              <SelectItem key={v} value={v}>
                {filter.field === 'temperature' ? (TEMP_LABELS[v] ?? v) : (TYPE_LABELS[v] ?? v)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {needsValue && !showSelect && (
        <Input
          className="w-40"
          placeholder={filter.operator === 'in' ? 'val1, val2, ...' : 'Valor'}
          value={Array.isArray(filter.value) ? filter.value.join(', ') : String(filter.value)}
          onChange={e => handleValueChange(e.target.value)}
        />
      )}

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-destructive shrink-0"
        onClick={() => onRemove(index)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface SegmentBuilderProps {
  trigger: React.ReactNode
  initialData?: Segment
  onSave: (segment: Segment) => void
}

export function SegmentBuilder({ trigger, initialData, onSave }: SegmentBuilderProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(initialData?.name ?? '')
  const [description, setDescription] = useState(initialData?.description ?? '')
  const [logic, setLogic] = useState<'AND' | 'OR'>(initialData?.filters?.logic ?? 'AND')
  const [filters, setFilters] = useState<SegmentFilter[]>(
    initialData?.filters?.filters ?? []
  )
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Reset form when dialog opens with (possibly updated) initialData
  useEffect(() => {
    if (open) {
      setName(initialData?.name ?? '')
      setDescription(initialData?.description ?? '')
      setLogic(initialData?.filters?.logic ?? 'AND')
      setFilters(initialData?.filters?.filters ?? [])
      setPreviewCount(null)
    }
  }, [open, initialData])

  // Debounced preview
  const runPreview = useCallback(
    async (currentFilters: SegmentFilter[], currentLogic: 'AND' | 'OR') => {
      if (currentFilters.length === 0) { setPreviewCount(null); return }
      setPreviewLoading(true)
      try {
        const result = await previewSegmentCount({ logic: currentLogic, filters: currentFilters })
        setPreviewCount(result.count)
      } catch {
        setPreviewCount(null)
      } finally {
        setPreviewLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    const t = setTimeout(() => runPreview(filters, logic), 500)
    return () => clearTimeout(t)
  }, [filters, logic, runPreview])

  function addFilter() {
    setFilters(prev => [...prev, { field: 'leadScore', operator: 'gt', value: '' }])
  }

  function updateFilter(index: number, updated: Partial<SegmentFilter>) {
    setFilters(prev => prev.map((f, i) => i === index ? { ...f, ...updated } : f))
  }

  function removeFilter(index: number) {
    setFilters(prev => prev.filter((_, i) => i !== index))
  }

  async function handleSave() {
    if (!name.trim()) { toast.error('El nombre es obligatorio'); return }
    if (filters.length === 0) { toast.error('Agrega al menos una condición'); return }

    setSaving(true)
    try {
      const segmentFilters: SegmentFilters = { logic, filters }
      let saved: Segment
      if (initialData) {
        saved = await updateSegment(initialData.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          filters: segmentFilters
        })
      } else {
        saved = await createSegment({
          name: name.trim(),
          description: description.trim() || undefined,
          filters: segmentFilters
        })
      }
      toast.success(initialData ? 'Segmento actualizado' : 'Segmento creado')
      onSave(saved)
      setOpen(false)
    } catch (err: any) {
      toast.error(err.message ?? 'Error al guardar segmento')
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
            <DialogTitle>{initialData ? 'Editar segmento' : 'Nuevo segmento'}</DialogTitle>
            <DialogDescription>
              Define las condiciones para agrupar contactos dinámicamente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="seg-name">Nombre *</Label>
              <Input
                id="seg-name"
                placeholder="ej. Leads calientes con score alto"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="seg-desc">Descripción</Label>
              <Textarea
                id="seg-desc"
                placeholder="Descripción opcional..."
                rows={2}
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>

            <Separator />

            {/* Conditions */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Condiciones</Label>
                <ToggleGroup
                  type="single"
                  value={logic}
                  onValueChange={v => v && setLogic(v as 'AND' | 'OR')}
                  size="sm"
                >
                  <ToggleGroupItem value="AND" className="text-xs px-3">Cumple TODAS</ToggleGroupItem>
                  <ToggleGroupItem value="OR" className="text-xs px-3">Cumple ALGUNA</ToggleGroupItem>
                </ToggleGroup>
              </div>

              <div className="space-y-2">
                {filters.map((filter, i) => (
                  <FilterRow
                    key={i}
                    filter={filter}
                    index={i}
                    onChange={updateFilter}
                    onRemove={removeFilter}
                  />
                ))}
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addFilter}
                className="w-full border-dashed"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Agregar condición
              </Button>
            </div>

            {/* Preview count */}
            {filters.length > 0 && (
              <div className="flex items-center gap-2 rounded-md bg-muted/50 px-4 py-2.5 text-sm">
                <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                {previewLoading ? (
                  <span className="text-muted-foreground">Calculando...</span>
                ) : previewCount !== null ? (
                  <span>
                    Coincide con aproximadamente{' '}
                    <Badge variant="secondary" className="ml-0.5">{previewCount}</Badge>
                    {' '}contacto{previewCount !== 1 ? 's' : ''}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Vista previa no disponible</span>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : initialData ? 'Guardar cambios' : 'Crear segmento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
