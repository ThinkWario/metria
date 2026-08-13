'use client'

import { useState, useEffect } from 'react'
import { fetchAPI } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { UserCog } from 'lucide-react'
import { toast } from 'sonner'

/**
 * Edits the workspace-wide "Ejecutivo responsable" name/title used on every
 * generated Carta de intención de proyecto solar — a single saved value
 * reused across all leads, not a per-contact field.
 */
export function VisitLetterExecutiveModal({
  open, onClose
}: {
  open: boolean
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    let active = true
    setLoading(true)
    fetchAPI('/scheduling/booking-config')
      .then(data => {
        if (!active) return
        setName(data.visitLetterExecutiveName ?? '')
        setTitle(data.visitLetterExecutiveTitle ?? '')
      })
      .catch(err => { if (active) toast.error(err instanceof Error ? err.message : 'Error al cargar los datos del ejecutivo') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [open])

  async function handleSave() {
    setSaving(true)
    try {
      await fetchAPI('/scheduling/booking-config', {
        method: 'PATCH',
        body: JSON.stringify({
          visitLetterExecutiveName: name.trim() || null,
          visitLetterExecutiveTitle: title.trim() || null
        })
      })
      toast.success('Ejecutivo responsable guardado')
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="h-4 w-4" /> Ejecutivo responsable
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <p className="text-xs text-muted-foreground">
            Este nombre y cargo aparecen en la Carta de intención de proyecto solar generada para cada lead.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="visit-letter-exec-name">Nombre</Label>
            <Input
              id="visit-letter-exec-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Roberto Morales"
              disabled={loading}
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="visit-letter-exec-title">Cargo</Label>
            <Input
              id="visit-letter-exec-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Gerente Comercial"
              disabled={loading}
              maxLength={120}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
