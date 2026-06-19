'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import {
  Megaphone, Plus, Pencil, Trash2, Users, CheckCircle2, XCircle,
  Search, Copy, Calendar, CalendarOff, Send
} from 'lucide-react'
import { toast } from 'sonner'
import { CampaignComposer } from '@/components/crm/CampaignComposer'
import { CHANNEL_META, STATUS_META } from '@/components/crm/campaign-presentation'
import {
  listCampaigns, deleteCampaign, getCampaign, updateCampaign,
  scheduleCampaign, testSendCampaign,
  type Campaign, type CampaignListItem, type CampaignDetail
} from '@/lib/campaigns-api'
import { fetchAPI } from '@/lib/api'
import { useUserStore } from '@/store/useUserStore'
import { formatDistanceToNow, format } from 'date-fns'
import { es } from 'date-fns/locale'

const EDITABLE = new Set(['DRAFT', 'SCHEDULED'])

/** datetime-local min value: now + 10 minutes (rounded to the minute). */
function minScheduleDateTime(): string {
  const d = new Date(Date.now() + 10 * 60 * 1000)
  return d.toISOString().slice(0, 16)
}

export default function CampaignsClient() {
  const [mounted, setMounted] = useState(false)
  const [campaigns, setCampaigns] = useState<CampaignListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<CampaignListItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [detail, setDetail] = useState<CampaignDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [duplicating, setDuplicating] = useState<string | null>(null)

  // ── Schedule dialog state ──────────────────────────────────────────────────
  const [scheduleTarget, setScheduleTarget] = useState<CampaignListItem | null>(null)
  const [scheduledAt, setScheduledAt] = useState('')
  const [scheduling, setScheduling] = useState(false)

  // ── Test send dialog state ─────────────────────────────────────────────────
  const [testTarget, setTestTarget] = useState<CampaignListItem | null>(null)
  const [testEmail, setTestEmail] = useState('')
  const [testing, setTesting] = useState(false)

  const { user } = useUserStore()

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    fetchCampaigns()
  }, [mounted])

  async function fetchCampaigns() {
    setLoading(true)
    try {
      setCampaigns(await listCampaigns())
    } catch {
      toast.error('Error al cargar campañas')
    } finally {
      setLoading(false)
    }
  }

  // Optimistically merge a saved/sent campaign, then resync derived counts.
  function handleSaved(saved: Campaign) {
    setCampaigns((prev) => {
      const item = prev.find((c) => c.id === saved.id)
      const merged: CampaignListItem = {
        ...saved,
        recipientCount: item?.recipientCount ?? 0,
        sentCount: item?.sentCount ?? 0,
      }
      if (item) return prev.map((c) => (c.id === saved.id ? merged : c))
      return [merged, ...prev]
    })
    // Refetch in the background to pick up server-computed counts/stats.
    fetchCampaigns()
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteCampaign(deleteTarget.id)
      setCampaigns((prev) => prev.filter((c) => c.id !== deleteTarget.id))
      toast.success('Campaña eliminada')
    } catch (err: any) {
      toast.error(err.message ?? 'Error al eliminar campaña')
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  async function openDetail(c: CampaignListItem) {
    // Only sent/sending/failed campaigns have meaningful stats to show.
    if (c.status === 'DRAFT' || c.status === 'SCHEDULED') return
    setDetailLoading(true)
    setDetail(null)
    try {
      const d = await getCampaign(c.id)
      setDetail(d)
    } catch {
      toast.error('No se pudieron cargar las estadísticas')
    } finally {
      setDetailLoading(false)
    }
  }

  async function handleDuplicate(c: CampaignListItem) {
    setDuplicating(c.id)
    try {
      const duplicate = await fetchAPI(`/crm/campaigns/${c.id}/duplicate`, { method: 'POST' })
      const item: CampaignListItem = { ...duplicate, recipientCount: 0, sentCount: 0 }
      setCampaigns(prev => [item, ...prev])
      toast.success('Duplicado creado')
    } catch (err: any) {
      toast.error(err.message ?? 'Error al duplicar campaña')
    } finally {
      setDuplicating(null)
    }
  }

  async function handleSchedule() {
    if (!scheduleTarget || !scheduledAt) return
    setScheduling(true)
    try {
      const updated = await scheduleCampaign(scheduleTarget.id, new Date(scheduledAt).toISOString())
      handleSaved(updated)
      toast.success(`Campaña programada para ${format(new Date(scheduledAt), "d MMM, HH:mm", { locale: es })}`)
      setScheduleTarget(null)
      setScheduledAt('')
    } catch (err: any) {
      toast.error(err.message ?? 'Error al programar campaña')
    } finally {
      setScheduling(false)
    }
  }

  async function handleCancelSchedule(c: CampaignListItem) {
    try {
      const updated = await updateCampaign(c.id, { scheduledAt: null })
      handleSaved(updated)
      toast.success('Programación cancelada')
    } catch (err: any) {
      toast.error(err.message ?? 'Error al cancelar programación')
    }
  }

  async function handleTest() {
    if (!testTarget || !testEmail) return
    setTesting(true)
    try {
      const result = await testSendCampaign(testTarget.id, testEmail)
      if (result.sent) {
        toast.success(`Prueba enviada a ${testEmail}`)
      } else {
        toast.info(`Prueba registrada (sin proveedor de email configurado)`)
      }
      setTestTarget(null)
      setTestEmail('')
    } catch (err: any) {
      toast.error(err.message ?? 'Error en envío de prueba')
    } finally {
      setTesting(false)
    }
  }

  if (!mounted || loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-32 mt-2" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-6 w-40" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const filteredCampaigns = campaigns.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Buscar campañas…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="ml-auto">
          <CampaignComposer
            trigger={
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nueva campaña
              </Button>
            }
            onSaved={handleSaved}
          />
        </div>
      </div>

      {/* Empty state */}
      {campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20 gap-4 text-center">
          <div className="rounded-full bg-muted p-4">
            <Megaphone className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">Sin campañas todavía</p>
            <p className="text-sm text-muted-foreground mt-1">
              Crea tu primera campaña para llegar a un segmento de contactos.
            </p>
          </div>
          <CampaignComposer
            trigger={<Button variant="outline">Crear primera campaña</Button>}
            onSaved={handleSaved}
          />
        </div>
      ) : filteredCampaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 gap-3 text-center">
          <p className="text-sm text-muted-foreground">Sin resultados para «{searchTerm}»</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredCampaigns.map((c) => {
            const channel = CHANNEL_META[c.channel]
            const status = STATUS_META[c.status]
            const ChannelIcon = channel.Icon
            const isDone = c.status === 'SENT' || c.status === 'FAILED'
            const clickable = isDone || c.status === 'SENDING'

            return (
              <Card
                key={c.id}
                className={`group relative transition-colors ${clickable ? 'cursor-pointer hover:border-primary/40' : ''}`}
                onClick={() => clickable && openDetail(c)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-tight truncate">{c.name}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${channel.chip}`}
                        >
                          <ChannelIcon className="h-3 w-3" />
                          {channel.label}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${status.badge}`}
                        >
                          {status.pulse && (
                            <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                          )}
                          {status.label}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div
                      className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground"
                        title="Duplicar"
                        disabled={duplicating === c.id}
                        onClick={() => handleDuplicate(c)}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      {EDITABLE.has(c.status) && (
                        <>
                          {c.status === 'DRAFT' && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground"
                                title="Envío de prueba"
                                onClick={() => {
                                  setTestEmail(user?.email ?? '')
                                  setTestTarget(c)
                                }}
                              >
                                <Send className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground"
                                title="Programar envío"
                                onClick={() => setScheduleTarget(c)}
                              >
                                <Calendar className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                          {c.status === 'SCHEDULED' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground"
                              title="Cancelar programación"
                              onClick={() => handleCancelSchedule(c)}
                            >
                              <CalendarOff className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <CampaignComposer
                            key={c.id}
                            initialData={c}
                            trigger={
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            }
                            onSaved={handleSaved}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteTarget(c)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="flex items-center gap-3 flex-wrap">
                  <Badge variant="secondary" className="flex items-center gap-1.5">
                    <Users className="h-3 w-3" />
                    {c.recipientCount} destinatario{c.recipientCount !== 1 ? 's' : ''}
                  </Badge>
                  {isDone && (
                    <Badge variant="secondary" className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      {c.sentCount} enviado{c.sentCount !== 1 ? 's' : ''}
                    </Badge>
                  )}
                  {c.status === 'SCHEDULED' && c.scheduledAt && (
                    <Badge variant="outline" className="flex items-center gap-1.5 text-blue-600 border-blue-300 dark:border-blue-700">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(c.scheduledAt), "d MMM, HH:mm", { locale: es })}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {formatDistanceToNow(new Date(c.sentAt ?? c.createdAt), {
                      addSuffix: true,
                      locale: es,
                    })}
                  </span>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar campaña?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <strong>{deleteTarget?.name}</strong>. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Eliminando…' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Schedule dialog */}
      <Dialog
        open={!!scheduleTarget}
        onOpenChange={(o) => { if (!o) { setScheduleTarget(null); setScheduledAt('') } }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Programar campaña
            </DialogTitle>
            <DialogDescription>
              Selecciona cuándo enviar <strong>{scheduleTarget?.name}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <input
              type="datetime-local"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              min={minScheduleDateTime()}
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
            <Button
              className="w-full"
              disabled={!scheduledAt || scheduling}
              onClick={handleSchedule}
            >
              {scheduling ? 'Programando…' : 'Confirmar programación'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Test send dialog */}
      <Dialog
        open={!!testTarget}
        onOpenChange={(o) => { if (!o) { setTestTarget(null); setTestEmail('') } }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-4 w-4" />
              Envío de prueba
            </DialogTitle>
            <DialogDescription>
              Se enviará una prueba de <strong>{testTarget?.name}</strong> con datos de ejemplo
              (nombre y teléfono ficticios).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Input
              type="email"
              placeholder="correo@ejemplo.com"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleTest()}
            />
            <Button
              className="w-full"
              disabled={!testEmail || testing}
              onClick={handleTest}
            >
              {testing ? 'Enviando…' : 'Enviar prueba'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Stats detail */}
      <Dialog
        open={detailLoading || !!detail}
        onOpenChange={(o) => { if (!o) { setDetail(null); setDetailLoading(false) } }}
      >
        <DialogContent className="sm:max-w-md">
          {detailLoading || !detail ? (
            <div className="space-y-3 py-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : (
            <CampaignStatsView detail={detail} />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

// ── Stats view ─────────────────────────────────────────────────────────────────

function CampaignStatsView({ detail }: { detail: CampaignDetail }) {
  const channel = CHANNEL_META[detail.channel]
  const status = STATUS_META[detail.status]
  const ChannelIcon = channel.Icon
  const total = detail.stats?.total ?? detail.recipientCount
  const sent = detail.stats?.sent ?? detail.recipientStats['SENT'] ?? 0
  const failed = detail.stats?.failed ?? (detail.recipientStats['FAILED'] ?? 0)
  const rate = total > 0 ? Math.round((sent / total) * 100) : 0

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ChannelIcon className="h-4 w-4" />
          {detail.name}
        </DialogTitle>
        <DialogDescription className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${status.badge}`}>
            {status.label}
          </span>
          {detail.segment && <span>· {detail.segment.name}</span>}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-2">
        {/* Delivery rate */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Tasa de entrega</span>
            <span className="font-medium">{rate}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${rate}%` }}
            />
          </div>
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-3 gap-3">
          <StatTile label="Total" value={total} />
          <StatTile label="Enviados" value={sent} icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />} />
          <StatTile label="Fallidos" value={failed} icon={<XCircle className="h-3.5 w-3.5 text-destructive" />} />
        </div>

        {detail.sentAt && (
          <p className="text-xs text-muted-foreground text-center">
            Enviada {formatDistanceToNow(new Date(detail.sentAt), { addSuffix: true, locale: es })}
          </p>
        )}
      </div>
    </>
  )
}

function StatTile({ label, value, icon }: { label: string; value: number; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-3 text-center">
      <div className="flex items-center justify-center gap-1 text-2xl font-semibold tabular-nums">
        {icon}
        {value}
      </div>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  )
}
