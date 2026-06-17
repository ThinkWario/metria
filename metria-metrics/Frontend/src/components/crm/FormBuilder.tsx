'use client'

import { useState, useEffect } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import {
  Plus, Trash2, GripVertical, ArrowUp, ArrowDown, Type, Mail, Phone,
  AlignLeft, ChevronDownSquare
} from 'lucide-react'
import {
  type FormField, type FormFieldType, type Form,
  createForm, updateForm
} from '@/lib/forms-api'
import { toast } from 'sonner'

// ── Field-type catalog ───────────────────────────────────────────────────────

const FIELD_TYPES: { value: FormFieldType; label: string; icon: typeof Type }[] = [
  { value: 'text', label: 'Texto corto', icon: Type },
  { value: 'email', label: 'Correo', icon: Mail },
  { value: 'tel', label: 'Teléfono', icon: Phone },
  { value: 'textarea', label: 'Texto largo', icon: AlignLeft },
  { value: 'select', label: 'Lista de opciones', icon: ChevronDownSquare }
]

function newId() {
  return `f_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`
}

function blankField(): FormField {
  return { id: newId(), label: '', type: 'text', required: false }
}

// A sensible starter so a brand-new form is never empty.
function starterFields(): FormField[] {
  return [
    { id: newId(), label: 'Nombre', type: 'text', required: true },
    { id: newId(), label: 'Correo', type: 'email', required: true },
    { id: newId(), label: 'Teléfono', type: 'tel', required: false }
  ]
}

// ── Per-field editor row ─────────────────────────────────────────────────────

interface FieldRowProps {
  field: FormField
  index: number
  total: number
  onChange: (index: number, patch: Partial<FormField>) => void
  onRemove: (index: number) => void
  onMove: (index: number, dir: -1 | 1) => void
}

function FieldRow({ field, index, total, onChange, onRemove, onMove }: FieldRowProps) {
  return (
    <div className="rounded-lg border bg-card p-3 space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex flex-col text-muted-foreground/60">
          <GripVertical className="h-4 w-4" />
        </div>

        <Input
          className="flex-1"
          placeholder="Etiqueta del campo (ej. Tu nombre)"
          value={field.label}
          onChange={e => onChange(index, { label: e.target.value })}
          aria-label={`Etiqueta del campo ${index + 1}`}
        />

        <Select
          value={field.type}
          onValueChange={(v: FormFieldType) =>
            onChange(index, {
              type: v,
              options: v === 'select' ? (field.options?.length ? field.options : ['Opción 1']) : undefined
            })
          }
        >
          <SelectTrigger className="w-40 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FIELD_TYPES.map(t => {
              const Icon = t.icon
              return (
                <SelectItem key={t.value} value={t.value}>
                  <span className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5" />
                    {t.label}
                  </span>
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
      </div>

      {/* Options editor — only for select */}
      {field.type === 'select' && (
        <div className="pl-6 space-y-2">
          <Label className="text-xs text-muted-foreground">Opciones</Label>
          {(field.options ?? []).map((opt, oi) => (
            <div key={oi} className="flex items-center gap-2">
              <Input
                className="h-8"
                placeholder={`Opción ${oi + 1}`}
                value={opt}
                onChange={e => {
                  const options = [...(field.options ?? [])]
                  options[oi] = e.target.value
                  onChange(index, { options })
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                onClick={() => {
                  const options = (field.options ?? []).filter((_, i) => i !== oi)
                  onChange(index, { options })
                }}
                aria-label="Quitar opción"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 border-dashed"
            onClick={() => onChange(index, { options: [...(field.options ?? []), ''] })}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Añadir opción
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between pl-6">
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <Switch
            checked={field.required}
            onCheckedChange={(checked: boolean) => onChange(index, { required: checked })}
          />
          Obligatorio
        </label>

        <div className="flex items-center gap-1">
          <Button
            type="button" variant="ghost" size="icon" className="h-8 w-8"
            disabled={index === 0}
            onClick={() => onMove(index, -1)}
            aria-label="Subir campo"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button" variant="ghost" size="icon" className="h-8 w-8"
            disabled={index === total - 1}
            onClick={() => onMove(index, 1)}
            aria-label="Bajar campo"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button" variant="ghost" size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={() => onRemove(index)}
            aria-label="Eliminar campo"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface FormBuilderProps {
  trigger: React.ReactNode
  initialData?: Form
  onSave: (form: Form) => void
}

export function FormBuilder({ trigger, initialData, onSave }: FormBuilderProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [submitButtonText, setSubmitButtonText] = useState('Enviar')
  const [successMessage, setSuccessMessage] = useState('¡Gracias! Te contactaremos pronto.')
  const [fields, setFields] = useState<FormField[]>([])
  const [saving, setSaving] = useState(false)

  // Reset to (possibly updated) initialData each time the dialog opens.
  useEffect(() => {
    if (!open) return
    setName(initialData?.name ?? '')
    setDescription(initialData?.description ?? '')
    setSubmitButtonText(initialData?.submitButtonText ?? 'Enviar')
    setSuccessMessage(initialData?.successMessage ?? '¡Gracias! Te contactaremos pronto.')
    setFields(
      initialData?.fields?.length
        ? initialData.fields.map(f => ({ ...f, options: f.options ? [...f.options] : undefined }))
        : starterFields()
    )
  }, [open, initialData])

  function addField() {
    setFields(prev => [...prev, blankField()])
  }

  function updateField(index: number, patch: Partial<FormField>) {
    setFields(prev => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)))
  }

  function removeField(index: number) {
    setFields(prev => prev.filter((_, i) => i !== index))
  }

  function moveField(index: number, dir: -1 | 1) {
    setFields(prev => {
      const next = [...prev]
      const target = index + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  // Client-side guard mirroring the server rules so we fail fast with a toast.
  function validate(): string | null {
    if (!name.trim()) return 'Ponle un nombre al formulario'
    if (fields.length === 0) return 'Agrega al menos un campo'
    for (const f of fields) {
      if (!f.label.trim()) return 'Cada campo necesita una etiqueta'
      if (f.type === 'select') {
        const opts = (f.options ?? []).map(o => o.trim()).filter(Boolean)
        if (opts.length === 0) return `El campo "${f.label}" necesita al menos una opción`
      }
    }
    return null
  }

  async function handleSave() {
    const error = validate()
    if (error) { toast.error(error); return }

    // Normalize select options (trim + drop blanks) before sending.
    const cleanFields: FormField[] = fields.map(f => ({
      id: f.id,
      label: f.label.trim(),
      type: f.type,
      required: f.required,
      ...(f.type === 'select'
        ? { options: (f.options ?? []).map(o => o.trim()).filter(Boolean) }
        : {})
    }))

    setSaving(true)
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        fields: cleanFields,
        submitButtonText: submitButtonText.trim() || undefined,
        successMessage: successMessage.trim() || undefined
      }
      const saved = initialData
        ? await updateForm(initialData.id, payload)
        : await createForm(payload)
      toast.success(initialData ? 'Formulario actualizado' : 'Formulario creado')
      onSave(saved)
      setOpen(false)
    } catch (err: any) {
      toast.error(err?.message ?? 'Error al guardar el formulario')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <span onClick={() => setOpen(true)} className="contents cursor-pointer">
        {trigger}
      </span>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{initialData ? 'Editar formulario' : 'Nuevo formulario'}</DialogTitle>
            <DialogDescription>
              Diseña el formulario que tus clientes verán. Cada envío crea un lead en tu CRM.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-1">
            {/* Identity */}
            <div className="space-y-1.5">
              <Label htmlFor="form-name">Nombre *</Label>
              <Input
                id="form-name"
                placeholder="ej. Solicita una cotización"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="form-desc">Descripción</Label>
              <Textarea
                id="form-desc"
                placeholder="Texto que aparece bajo el título (opcional)"
                rows={2}
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>

            <Separator />

            {/* Fields */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Campos del formulario</Label>
                <span className="text-xs text-muted-foreground">
                  {fields.length} campo{fields.length !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="space-y-2">
                {fields.map((field, i) => (
                  <FieldRow
                    key={field.id}
                    field={field}
                    index={i}
                    total={fields.length}
                    onChange={updateField}
                    onRemove={removeField}
                    onMove={moveField}
                  />
                ))}
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addField}
                className="w-full border-dashed"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Agregar campo
              </Button>
            </div>

            <Separator />

            {/* Copy */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="form-cta">Texto del botón</Label>
                <Input
                  id="form-cta"
                  placeholder="Enviar"
                  value={submitButtonText}
                  onChange={e => setSubmitButtonText(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="form-success">Mensaje de éxito</Label>
                <Input
                  id="form-success"
                  placeholder="¡Gracias! Te contactaremos pronto."
                  value={successMessage}
                  onChange={e => setSuccessMessage(e.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando…' : initialData ? 'Guardar cambios' : 'Crear formulario'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
