'use client'

import { useState, useEffect, useRef } from 'react'
import { fetchAPI } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { X, KanbanSquare, Pencil } from 'lucide-react'
import { toast } from 'sonner'

export interface Stage { id: string; name: string; color: string; order: number; isWon: boolean; isLost: boolean }
export interface Deal {
  id: string; title: string; value: string; status: string
  probability?: number | null; expectedCloseAt?: string | null; createdAt: string
  assignedToUserId?: string | null
  contact: { id: string; name: string; phone?: string | null; leadTemperature?: string | null; leadScore?: number | null }
  stage: { id: string; name: string; color: string }
}
export interface ContactSearch { id: string; name: string; phone?: string | null; email?: string | null }

// ── Create / Edit Deal Modal ───────────────────────────────────────────────────
export function CreateDealModal({
  open, onClose, stages, defaultStageId, pipelineId, onCreated,
  editDeal = null, onUpdated
}: {
  open: boolean; onClose: () => void; stages: Stage[]
  defaultStageId: string; pipelineId: string; onCreated: (deal: Deal) => void
  editDeal?: Deal | null; onUpdated?: (deal: Deal) => void
}) {
  const isEdit = editDeal != null
  const [title, setTitle] = useState('')
  const [value, setValue] = useState('')
  const [probability, setProbability] = useState('50')
  const [expectedCloseAt, setExpectedCloseAt] = useState('')
  const [stageId, setStageId] = useState(defaultStageId)
  const [contactSearch, setContactSearch] = useState('')
  const [contactResults, setContactResults] = useState<ContactSearch[]>([])
  const [selectedContact, setSelectedContact] = useState<ContactSearch | null>(null)
  const [saving, setSaving] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Initialize fields when modal opens
  useEffect(() => {
    if (!open) return
    if (isEdit && editDeal) {
      setTitle(editDeal.title)
      setValue(editDeal.value || '')
      setProbability(editDeal.probability?.toString() ?? '50')
      setExpectedCloseAt(editDeal.expectedCloseAt ? editDeal.expectedCloseAt.substring(0, 10) : '')
    } else {
      setStageId(defaultStageId)
    }
  }, [open, editDeal, isEdit, defaultStageId])

  useEffect(() => {
    if (!open || isEdit) return
    clearTimeout(timerRef.current)
    if (!contactSearch.trim() || selectedContact) { setContactResults([]); return }
    timerRef.current = setTimeout(async () => {
      try {
        const data = await fetchAPI(`/crm/contacts?search=${encodeURIComponent(contactSearch)}&limit=8`)
        setContactResults(Array.isArray(data) ? data : (data?.contacts ?? []))
      } catch { setContactResults([]) }
    }, 300)
  }, [contactSearch, selectedContact, open, isEdit])

  function reset() {
    setTitle(''); setValue(''); setProbability('50'); setExpectedCloseAt('')
    setSelectedContact(null); setContactSearch(''); setContactResults([])
  }

  async function handleSave() {
    if (isEdit && editDeal) {
      if (!title.trim()) return toast.error('El título es obligatorio')
      setSaving(true)
      try {
        const updated = await fetchAPI(`/crm/deals/${editDeal.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            title: title.trim(),
            value: parseFloat(value) || 0,
            probability: parseInt(probability) || null,
            expectedCloseAt: expectedCloseAt || null
          })
        })
        onUpdated?.(updated)
        toast.success('Deal actualizado')
        reset(); onClose()
      } catch (err: any) { toast.error(err.message) }
      finally { setSaving(false) }
      return
    }

    if (!title.trim() || !selectedContact) return toast.error('Título y contacto son obligatorios')
    setSaving(true)
    try {
      const deal = await fetchAPI('/crm/deals', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(), contactId: selectedContact.id,
          pipelineId, stageId,
          value: parseFloat(value) || 0,
          probability: parseInt(probability) || null,
          expectedCloseAt: expectedCloseAt || null
        })
      })
      onCreated(deal)
      toast.success('Deal creado')
      reset(); onClose()
    } catch (err: any) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const prob = parseInt(probability) || 50
  const probColor = prob >= 70 ? 'text-emerald-600' : prob >= 40 ? 'text-amber-600' : 'text-red-600'

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { reset(); onClose() } }}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEdit
              ? <><Pencil className="h-4 w-4" /> Editar Deal</>
              : <><KanbanSquare className="h-4 w-4" /> Nuevo Deal</>
            }
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input placeholder="Ej. Instalación Solar 10 paneles" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
          </div>

          {!isEdit && (
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
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Valor (CLP)</Label>
              <Input type="number" placeholder="3500000" value={value} onChange={e => setValue(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Cierre estimado</Label>
              <Input type="date" value={expectedCloseAt} onChange={e => setExpectedCloseAt(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <Label>Probabilidad de cierre</Label>
              <span className={`text-sm font-bold tabular-nums ${probColor}`}>{prob}%</span>
            </div>
            <input
              type="range" min="0" max="100" step="5" value={probability}
              onChange={e => setProbability(e.target.value)}
              className="w-full accent-primary"
            />
          </div>

          {!isEdit && (
            <div className="space-y-1.5">
              <Label>Etapa inicial</Label>
              <Select value={stageId} onValueChange={setStageId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {stages.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: s.color }} />
                        {s.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose() }}>Cancelar</Button>
          <Button
            onClick={handleSave}
            disabled={saving || !title.trim() || (!isEdit && !selectedContact)}
          >
            {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear Deal'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
