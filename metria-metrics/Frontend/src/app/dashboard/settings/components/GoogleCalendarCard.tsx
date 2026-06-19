'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Calendar, CheckCircle2, Link2Off, RefreshCw, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { fetchAPI } from '@/lib/api'

interface CalendarStatus {
  connected: boolean
  email: string | null
  calendarId: string | null
}

interface CalendarOption {
  id: string
  summary: string
  primary: boolean
}

export function GoogleCalendarCard() {
  const [mounted, setMounted] = useState(false)
  const [status, setStatus] = useState<CalendarStatus | null>(null)
  const [calendars, setCalendars] = useState<CalendarOption[]>([])
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  useEffect(() => {
    setMounted(true)
    const params = new URLSearchParams(window.location.search)
    if (params.get('cal_connected') === '1') {
      toast.success('Google Calendar conectado correctamente')
      window.history.replaceState({}, '', window.location.pathname)
    } else if (params.get('cal_error') === '1') {
      toast.error('Error al conectar Google Calendar')
      window.history.replaceState({}, '', window.location.pathname)
    }
    loadStatus()
  }, [])

  async function loadStatus() {
    setLoading(true)
    try {
      const data = await fetchAPI('/integrations/google-calendar/status')
      setStatus(data)
      if (data.connected) loadCalendars()
    } catch {
      // not critical
    } finally {
      setLoading(false)
    }
  }

  async function loadCalendars() {
    try {
      const data = await fetchAPI('/integrations/google-calendar/calendars')
      setCalendars(data.calendars ?? [])
    } catch {
      // ignore
    }
  }

  async function handleConnect() {
    setConnecting(true)
    try {
      const data = await fetchAPI('/integrations/google-calendar/auth')
      window.location.href = data.url
    } catch {
      toast.error('No se pudo iniciar la conexión con Google')
      setConnecting(false)
    }
  }

  async function handleDisconnect() {
    if (!confirm('¿Desconectar Google Calendar? Los eventos ya creados no se eliminarán.')) return
    setDisconnecting(true)
    try {
      await fetchAPI('/integrations/google-calendar', { method: 'DELETE' })
      setStatus({ connected: false, email: null, calendarId: null })
      setCalendars([])
      toast.success('Google Calendar desconectado')
    } catch {
      toast.error('Error al desconectar')
    } finally {
      setDisconnecting(false)
    }
  }

  async function handleCalendarChange(calendarId: string) {
    try {
      await fetchAPI('/integrations/google-calendar/calendar', {
        method: 'PATCH',
        body: JSON.stringify({ calendarId })
      })
      setStatus(s => s ? { ...s, calendarId } : s)
      toast.success('Calendario actualizado')
    } catch {
      toast.error('Error al actualizar calendario')
    }
  }

  if (!mounted || loading) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-5 animate-pulse">
        <div className="h-5 w-40 rounded bg-white/10 mb-2" />
        <div className="h-3 w-72 rounded bg-white/10" />
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
            <Calendar className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">Google Calendar</span>
              {status?.connected && (
                <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-400/30 bg-emerald-400/10">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Conectado
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {status?.connected
                ? `Sincronizando con ${status.email}`
                : 'Sincroniza disponibilidad y crea eventos automáticamente en tu agenda'}
            </p>
          </div>
        </div>

        {!status?.connected ? (
          <Button
            size="sm"
            variant="outline"
            onClick={handleConnect}
            disabled={connecting}
            className="shrink-0"
          >
            {connecting ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ExternalLink className="h-4 w-4 mr-2" />
            )}
            Conectar
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="shrink-0 text-destructive hover:text-destructive"
          >
            <Link2Off className="h-4 w-4 mr-2" />
            Desconectar
          </Button>
        )}
      </div>

      {status?.connected && calendars.length > 0 && (
        <div className="flex items-center gap-3 pt-1">
          <span className="text-xs text-muted-foreground w-32 shrink-0">Calendario activo</span>
          <Select value={status.calendarId ?? 'primary'} onValueChange={handleCalendarChange}>
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {calendars.map(c => (
                <SelectItem key={c.id} value={c.id} className="text-xs">
                  {c.summary}{c.primary ? ' (principal)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}
