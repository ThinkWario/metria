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
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, Pencil, X, Zap } from 'lucide-react'
import {
  type QuickReply, listQuickReplies, createQuickReply, updateQuickReply, deleteQuickReply
} from '@/lib/quick-replies-api'
import { toast } from 'sonner'

interface QuickRepliesManagerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after any create/update/delete so the picker can refresh its list. */
  onChange?: (replies: QuickReply[]) => void
}

const EMPTY_FORM = { title: '', content: '', shortcut: '' }

export function QuickRepliesManager({ open, onOpenChange, onChange }: QuickRepliesManagerProps) {
  const [replies, setReplies] = useState<QuickReply[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listQuickReplies()
      setReplies(data)
      onChange?.(data)
    } catch (err: any) {
      toast.error(err?.message ?? 'No se pudieron cargar las respuestas')
    } finally {
      setLoading(false)
    }
  }, [onChange])

  // Load list each time the dialog opens; reset the form too.
  useEffect(() => {
    if (open) {
      refresh()
      setEditingId(null)
      setForm(EMPTY_FORM)
    }
  }, [open, refresh])

  function startEdit(reply: QuickReply) {
    setEditingId(reply.id)
    setForm({
      title: reply.title,
      content: reply.content,
      shortcut: reply.shortcut ?? ''
    })
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  async function handleSave() {
    if (!form.title.trim()) { toast.error('El título es obligatorio'); return }
    if (!form.content.trim()) { toast.error('El contenido es obligatorio'); return }

    setSaving(true)
    try {
      const payload = {
        title: form.title.trim(),
        content: form.content.trim(),
        shortcut: form.shortcut.trim() || undefined
      }
      if (editingId) {
        await updateQuickReply(editingId, {
          ...payload,
          // allow clearing the shortcut on edit
          shortcut: form.shortcut.trim() || null
        })
        toast.success('Respuesta actualizada')
      } else {
        await createQuickReply(payload)
        toast.success('Respuesta creada')
      }
      setForm(EMPTY_FORM)
      setEditingId(null)
      await refresh()
    } catch (err: any) {
      toast.error(err?.message ?? 'Error al guardar la respuesta')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    // Optimistic removal
    const prev = replies
    setReplies(curr => curr.filter(r => r.id !== id))
    if (editingId === id) cancelEdit()
    try {
      await deleteQuickReply(id)
      toast.success('Respuesta eliminada')
      const next = prev.filter(r => r.id !== id)
      onChange?.(next)
    } catch (err: any) {
      setReplies(prev) // rollback
      toast.error(err?.message ?? 'No se pudo eliminar')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            Respuestas rápidas
          </DialogTitle>
          <DialogDescription>
            Crea plantillas reutilizables para responder más rápido en tus conversaciones.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* ── Create / edit form ─────────────────────────────────────── */}
          <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-4">
            <p className="text-sm font-semibold text-foreground">
              {editingId ? 'Editar respuesta' : 'Nueva respuesta'}
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="qr-title">Título *</Label>
                <Input
                  id="qr-title"
                  placeholder="ej. Saludo inicial"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qr-shortcut">Atajo</Label>
                <Input
                  id="qr-shortcut"
                  placeholder="ej. saludo"
                  value={form.shortcut}
                  onChange={e => setForm(f => ({ ...f, shortcut: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="qr-content">Contenido *</Label>
              <Textarea
                id="qr-content"
                placeholder="Hola, gracias por contactarnos..."
                rows={3}
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              />
            </div>

            <div className="flex justify-end gap-2">
              {editingId && (
                <Button variant="outline" size="sm" onClick={cancelEdit} disabled={saving}>
                  <X className="h-4 w-4 mr-1.5" />
                  Cancelar
                </Button>
              )}
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {!editingId && <Plus className="h-4 w-4 mr-1.5" />}
                {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Agregar respuesta'}
              </Button>
            </div>
          </div>

          <Separator />

          {/* ── List ───────────────────────────────────────────────────── */}
          <div className="space-y-2">
            <Label>Tus respuestas</Label>

            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-16 rounded-lg bg-muted/40 animate-pulse" />
                ))}
              </div>
            ) : replies.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
                No tienes respuestas rápidas aún. Crea la primera arriba.
              </div>
            ) : (
              <div className="space-y-2">
                {replies.map(reply => (
                  <div
                    key={reply.id}
                    className="group flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-card px-3 py-2.5 transition-colors hover:border-primary/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-foreground">{reply.title}</p>
                        {reply.shortcut && (
                          <Badge variant="secondary" className="shrink-0 text-[10px] font-mono">
                            /{reply.shortcut}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{reply.content}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => startEdit(reply)}
                        aria-label={`Editar ${reply.title}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(reply.id)}
                        aria-label={`Eliminar ${reply.title}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
