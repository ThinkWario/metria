'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Users, Send, Info, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import {
  type Campaign, type CampaignChannel, createCampaign, updateCampaign,
  sendCampaign, previewAudience
} from '@/lib/campaigns-api'
import { listSegments, type Segment } from '@/lib/crm-segments-api'
import { CHANNEL_META } from './campaign-presentation'

const CHANNELS: CampaignChannel[] = ['EMAIL', 'SMS', 'WHATSAPP']

interface CampaignComposerProps {
  trigger: React.ReactNode
  initialData?: Campaign
  /** Called after a successful save or send with the resulting campaign. */
  onSaved: (campaign: Campaign, didSend: boolean) => void
}

export function CampaignComposer({ trigger, initialData, onSaved }: CampaignComposerProps) {
  const [open, setOpen] = useState(false)
  const [confirmSend, setConfirmSend] = useState(false)

  const [name, setName] = useState('')
  const [channel, setChannel] = useState<CampaignChannel>('EMAIL')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [segmentId, setSegmentId] = useState<string>('')

  const [segments, setSegments] = useState<Segment[]>([])
  const [segmentsLoading, setSegmentsLoading] = useState(false)
  const [audience, setAudience] = useState<number | null>(null)
  const [audienceLoading, setAudienceLoading] = useState(false)
  const [busy, setBusy] = useState(false)

  // Reset the form whenever the dialog opens with (possibly new) initialData.
  useEffect(() => {
    if (!open) return
    setName(initialData?.name ?? '')
    setChannel((initialData?.channel as CampaignChannel) ?? 'EMAIL')
    setSubject(initialData?.subject ?? '')
    setBody(initialData?.body ?? '')
    setSegmentId(initialData?.segmentId ?? '')
    setAudience(null)
  }, [open, initialData])

  // Load segments once the dialog opens.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setSegmentsLoading(true)
    listSegments()
      .then((data) => { if (!cancelled) setSegments(data) })
      .catch(() => { if (!cancelled) toast.error('No se pudieron cargar los segmentos') })
      .finally(() => { if (!cancelled) setSegmentsLoading(false) })
    return () => { cancelled = true }
  }, [open])

  // Live audience count — debounced, mirrors SegmentBuilder's preview.
  const runPreview = useCallback(async (id: string) => {
    if (!id) { setAudience(null); return }
    setAudienceLoading(true)
    try {
      const { count } = await previewAudience(id)
      setAudience(count)
    } catch {
      setAudience(null)
    } finally {
      setAudienceLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => runPreview(segmentId), 400)
    return () => clearTimeout(t)
  }, [segmentId, runPreview])

  const isEmail = channel === 'EMAIL'

  function validate(): string | null {
    if (!name.trim()) return 'El nombre es obligatorio'
    if (isEmail && !subject.trim()) return 'El asunto es obligatorio para email'
    if (!body.trim()) return 'El mensaje no puede estar vacío'
    return null
  }

  function buildPayload() {
    return {
      name: name.trim(),
      channel,
      subject: isEmail ? subject.trim() : null,
      body,
      segmentId: segmentId || null,
    }
  }

  // Persist (create or update) and return the saved campaign id.
  async function persist(): Promise<Campaign> {
    const payload = buildPayload()
    if (initialData) return updateCampaign(initialData.id, payload)
    return createCampaign(payload)
  }

  async function handleSaveDraft() {
    const error = validate()
    if (error) { toast.error(error); return }
    setBusy(true)
    try {
      const saved = await persist()
      toast.success(initialData ? 'Campaña actualizada' : 'Borrador guardado')
      onSaved(saved, false)
      setOpen(false)
    } catch (err: any) {
      toast.error(err.message ?? 'No se pudo guardar la campaña')
    } finally {
      setBusy(false)
    }
  }

  // Validate + open the send confirmation.
  function requestSend() {
    const error = validate()
    if (error) { toast.error(error); return }
    if (!segmentId) { toast.error('Selecciona un segmento de audiencia'); return }
    if (audience === 0) { toast.error('El segmento no tiene contactos'); return }
    setConfirmSend(true)
  }

  async function handleSendNow() {
    setConfirmSend(false)
    setBusy(true)
    try {
      // Save latest edits first, then trigger the send.
      const saved = await persist()
      const sent = await sendCampaign(saved.id)
      const s = sent.stats
      toast.success(
        s ? `Campaña enviada · ${s.sent}/${s.total} entregados` : 'Campaña enviada'
      )
      onSaved(sent, true)
      setOpen(false)
    } catch (err: any) {
      toast.error(err.message ?? 'No se pudo enviar la campaña')
    } finally {
      setBusy(false)
    }
  }

  const ChannelIcon = CHANNEL_META[channel].Icon

  return (
    <>
      <span onClick={() => setOpen(true)} className="cursor-pointer">
        {trigger}
      </span>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{initialData ? 'Editar campaña' : 'Nueva campaña'}</DialogTitle>
            <DialogDescription>
              Envía un mensaje masivo a un segmento de tus contactos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="camp-name">Nombre *</Label>
              <Input
                id="camp-name"
                placeholder="ej. Oferta de bienvenida septiembre"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {/* Channel + Segment */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Canal</Label>
                <Select value={channel} onValueChange={(v) => setChannel(v as CampaignChannel)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CHANNELS.map((c) => {
                      const Icon = CHANNEL_META[c].Icon
                      return (
                        <SelectItem key={c} value={c}>
                          <span className="flex items-center gap-2">
                            <Icon className="h-3.5 w-3.5" />
                            {CHANNEL_META[c].label}
                          </span>
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Audiencia (segmento)</Label>
                <Select value={segmentId} onValueChange={setSegmentId} disabled={segmentsLoading}>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={segmentsLoading ? 'Cargando…' : 'Selecciona un segmento'}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {segments.length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                        No hay segmentos
                      </div>
                    ) : (
                      segments.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Subject (email only) */}
            {isEmail && (
              <div className="space-y-1.5">
                <Label htmlFor="camp-subject">Asunto *</Label>
                <Input
                  id="camp-subject"
                  placeholder="ej. Tu descuento te está esperando"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>
            )}

            {/* Body */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="camp-body">Mensaje *</Label>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Sparkles className="h-3 w-3" />
                  Usa <code className="rounded bg-muted px-1 py-0.5">{'{{name}}'}</code> y{' '}
                  <code className="rounded bg-muted px-1 py-0.5">{'{{phone}}'}</code>
                </span>
              </div>
              <Textarea
                id="camp-body"
                rows={isEmail ? 6 : 4}
                placeholder={`Hola {{name}}, tenemos algo para ti…`}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>

            <Separator />

            {/* Audience preview */}
            <div className="flex items-center gap-2 rounded-md bg-muted/50 px-4 py-2.5 text-sm">
              <Users className="h-4 w-4 text-muted-foreground shrink-0" />
              {!segmentId ? (
                <span className="text-muted-foreground">
                  Selecciona un segmento para ver la audiencia
                </span>
              ) : audienceLoading ? (
                <span className="text-muted-foreground">Calculando audiencia…</span>
              ) : audience !== null ? (
                <span>
                  Se enviará a{' '}
                  <Badge variant="secondary" className="ml-0.5">{audience}</Badge>{' '}
                  contacto{audience !== 1 ? 's' : ''}
                </span>
              ) : (
                <span className="text-muted-foreground">Audiencia no disponible</span>
              )}
            </div>

            {/* Delivery note */}
            <div className="flex items-start gap-2 rounded-md border border-dashed px-4 py-2.5 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                {channel === 'WHATSAPP' ? (
                  <>
                    El envío masivo por WhatsApp requiere plantillas aprobadas por Meta, por lo que
                    aquí se <strong>registra en el log</strong> (no se entrega) en este entorno.
                  </>
                ) : (
                  <>
                    {CHANNEL_META[channel].label} entrega de verdad solo si hay un proveedor
                    configurado ({isEmail ? 'Resend' : 'Twilio'}). Sin claves, el mensaje se{' '}
                    <strong>registra en el log</strong> y se cuenta como enviado.
                  </>
                )}
              </span>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button variant="secondary" onClick={handleSaveDraft} disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar borrador'}
            </Button>
            <Button onClick={requestSend} disabled={busy}>
              <Send className="h-4 w-4 mr-1.5" />
              Enviar ahora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send confirmation */}
      <AlertDialog open={confirmSend} onOpenChange={setConfirmSend}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ChannelIcon className="h-4 w-4" />
              ¿Enviar la campaña ahora?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se enviará <strong>{name.trim() || 'esta campaña'}</strong> por{' '}
              {CHANNEL_META[channel].label} a{' '}
              <strong>{audience ?? 0}</strong> contacto{audience !== 1 ? 's' : ''}. Esta acción no
              se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleSendNow} disabled={busy}>
              {busy ? 'Enviando…' : 'Sí, enviar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
