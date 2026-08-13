'use client'

import { useState } from 'react'
import { API_BASE_URL } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { FileText } from 'lucide-react'
import { toast } from 'sonner'

const MODALIDAD_OPTIONS = [
  { value: 'presencial', label: 'Reunión presencial' },
  { value: 'videollamada', label: 'Videollamada' },
  { value: 'llamada', label: 'Llamada telefónica' },
  { value: 'correo', label: 'Correo electrónico' }
]

const EMPTY_FORM = {
  nombre: '', rut: '', direccion: '', comuna: '', telefono: '', email: '',
  numeroClienteElectrico: '', distribuidora: '', fechaVisita: '', tecnicoResponsable: '',
  fechaPropuesta: '', fechaMaximaRespuesta: '', modalidad: '', numeroSolicitud: '', observaciones: ''
}

/**
 * "In situ" generator — a lead not yet in the CRM (e.g. met in person). Data
 * typed by hand here is never persisted; the PDF is generated and opened
 * directly from POST /crm/visit-letter/generate.
 */
export function VisitLetterGeneratorModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [generating, setGenerating] = useState(false)

  function set<K extends keyof typeof EMPTY_FORM>(key: K, value: string) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function reset() {
    setForm({ ...EMPTY_FORM })
  }

  async function handleGenerate() {
    if (!form.nombre.trim()) { toast.error('El nombre es obligatorio'); return }
    setGenerating(true)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('metria_token') : null
      const res = await fetch(`${API_BASE_URL}/crm/visit-letter/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(form)
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? 'No se pudo generar la carta')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener,noreferrer')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
      toast.success('Carta generada')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo generar la carta')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { reset(); onClose() } }}>
      <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" /> Generar carta de intención (lead no registrado)
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-1 text-sm">
          <div className="space-y-1.5 col-span-2">
            <Label>Nombre completo / Razón social *</Label>
            <Input value={form.nombre} onChange={e => set('nombre', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>RUT</Label>
            <Input value={form.rut} onChange={e => set('rut', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Teléfono</Label>
            <Input value={form.telefono} onChange={e => set('telefono', e.target.value)} />
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label>Correo electrónico</Label>
            <Input value={form.email} onChange={e => set('email', e.target.value)} />
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label>Dirección del proyecto</Label>
            <Input value={form.direccion} onChange={e => set('direccion', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Comuna / región</Label>
            <Input value={form.comuna} onChange={e => set('comuna', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>N.º de cliente eléctrico</Label>
            <Input value={form.numeroClienteElectrico} onChange={e => set('numeroClienteElectrico', e.target.value)} />
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label>Empresa distribuidora</Label>
            <Input value={form.distribuidora} onChange={e => set('distribuidora', e.target.value)} />
          </div>

          <div className="col-span-2 border-t pt-3 mt-1">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Programación y seguimiento</p>
          </div>
          <div className="space-y-1.5">
            <Label>Fecha y hora de la visita</Label>
            <Input value={form.fechaVisita} onChange={e => set('fechaVisita', e.target.value)} placeholder="14 de agosto a las 10:00" />
          </div>
          <div className="space-y-1.5">
            <Label>Técnico responsable</Label>
            <Input value={form.tecnicoResponsable} onChange={e => set('tecnicoResponsable', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Presentación de la propuesta</Label>
            <Input value={form.fechaPropuesta} onChange={e => set('fechaPropuesta', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Fecha máxima de respuesta</Label>
            <Input value={form.fechaMaximaRespuesta} onChange={e => set('fechaMaximaRespuesta', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>N.º de solicitud</Label>
            <Input value={form.numeroSolicitud} onChange={e => set('numeroSolicitud', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Modalidad de seguimiento</Label>
            <Select value={form.modalidad} onValueChange={v => set('modalidad', v)}>
              <SelectTrigger><SelectValue placeholder="Sin especificar" /></SelectTrigger>
              <SelectContent>
                {MODALIDAD_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label>Observaciones del levantamiento</Label>
            <Textarea value={form.observaciones} onChange={e => set('observaciones', e.target.value)} rows={3} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose() }}>Cancelar</Button>
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? 'Generando...' : 'Generar y ver PDF'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
