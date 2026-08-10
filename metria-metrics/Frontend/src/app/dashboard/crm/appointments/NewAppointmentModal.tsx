'use client'

import { useState, useEffect, useRef } from 'react'
import { fetchAPI } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CalendarPlus, X } from 'lucide-react'
import { toast } from 'sonner'
import type { ContactSearch } from '@/components/crm/CreateDealModal'

const TYPE_OPTIONS = [
  { value: 'SITE_VISIT', label: 'Visita técnica' },
  { value: 'CALL', label: 'Llamada' }
]

function dayLabel(iso: string): string {
  const label = new Date(iso).toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function NewAppointmentModal({
  open, onClose, onCreated
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const [type, setType] = useState('SITE_VISIT')
  const [contactSearch, setContactSearch] = useState('')
  const [contactResults, setContactResults] = useState<ContactSearch[]>([])
  const [selectedContact, setSelectedContact] = useState<ContactSearch | null>(null)
  const [slots, setSlots] = useState<string[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [scheduledAt, setScheduledAt] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (!open) return
    clearTimeout(timerRef.current)
    if (!contactSearch.trim() || selectedContact) { setContactResults([]); return }
    timerRef.current = setTimeout(async () => {
      try {
        const data = await fetchAPI(`/crm/contacts?search=${encodeURIComponent(contactSearch)}&limit=8`)
        setContactResults(Array.isArray(data) ? data : (data?.contacts ?? []))
      } catch { setContactResults([]) }
    }, 300)
  }, [contactSearch, selectedContact, open])

  // Reload available slots whenever the appointment type changes.
  useEffect(() => {
    if (!open) return
    setScheduledAt('')
    setLoadingSlots(true)
    fetchAPI(`/availability/slots?type=${type}`)
      .then((data: string[]) => setSlots(Array.isArray(data) ? data : []))
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false))
  }, [type, open])

  function reset() {
    setType('SITE_VISIT'); setContactSearch(''); setContactResults([]); setSelectedContact(null)
    setSlots([]); setScheduledAt(''); setNotes('')
  }

  async function handleSave() {
    if (!selectedContact || !scheduledAt) return toast.error('Contacto y horario son obligatorios')
    setSaving(true)
    try {
      await fetchAPI('/appointments', {
        method: 'POST',
        body: JSON.stringify({ contactId: selectedContact.id, type, scheduledAt, notes: notes.trim() || undefined })
      })
      toast.success('Cita agendada')
      onCreated()
      reset(); onClose()
    } catch (err: any) {
      toast.error(err.message || 'No se pudo agendar la cita')
    } finally {
      setSaving(false)
    }
  }

  // Group slots by day for the select list.
  const groups: { key: string; label: string; items: string[] }[] = []
  for (const iso of slots) {
    const key = iso.slice(0, 10)
    const existing = groups.find(g => g.key === key)
    if (existing) existing.items.push(iso)
    else groups.push({ key, label: dayLabel(iso), items: [iso] })
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { reset(); onClose() } }}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-4 w-4" /> Nueva cita
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Contacto</Label>
            {selectedContact ? (
              <div className="flex items-center gap-2 border rounded-lg px-3 py-2 bg-muted/30">
                <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold shrink-0">
                  {selectedContact.name[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{selectedContact.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{selectedContact.phone?.replace(/@.*$/, '') ?? selectedContact.email}</p>
                </div>
                <button onClick={() => { setSelectedContact(null); setContactSearch('') }} className="text-muted-foreground hover:text-foreground shrink-0">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Input
                  placeholder="Buscar por nombre o teléfono..."
                  value={contactSearch}
                  onChange={e => setContactSearch(e.target.value)}
                />
                {contactResults.length > 0 && (
                  <div className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                    {contactResults.map(c => (
                      <button
                        key={c.id}
                        className="w-full text-left px-3 py-2 hover:bg-muted flex items-center gap-2"
                        onMouseDown={e => { e.preventDefault(); setSelectedContact(c); setContactResults([]) }}
                      >
                        <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center text-xs font-bold shrink-0">
                          {c.name[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{c.name}</p>
                          <p className="text-[10px] text-muted-foreground">{c.phone?.replace(/@.*$/, '') ?? c.email}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Horario disponible</Label>
            <Select value={scheduledAt} onValueChange={setScheduledAt} disabled={loadingSlots || slots.length === 0}>
              <SelectTrigger>
                <SelectValue placeholder={loadingSlots ? 'Cargando horarios...' : slots.length === 0 ? 'Sin horarios disponibles' : 'Elige un horario'} />
              </SelectTrigger>
              <SelectContent>
                {groups.map(g => (
                  <SelectGroup key={g.key}>
                    <SelectLabel>{g.label}</SelectLabel>
                    {g.items.map(iso => (
                      <SelectItem key={iso} value={iso}>
                        {new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            {!loadingSlots && slots.length === 0 && (
              <p className="text-[11px] text-muted-foreground">
                Configura la disponibilidad en &quot;Enlace de reserva&quot; para habilitar horarios.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Notas (opcional)</Label>
            <Textarea placeholder="Detalles para el equipo..." value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose() }}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !selectedContact || !scheduledAt}>
            {saving ? 'Agendando...' : 'Agendar cita'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
