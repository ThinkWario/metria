'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Calendar, ExternalLink, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
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
      <Card className="bg-card/30 backdrop-blur-xl border border-border/50 animate-pulse">
        <CardHeader className="pb-3">
          <div className="h-9 w-9 rounded-xl bg-muted/50 mb-2" />
          <div className="h-5 w-32 rounded bg-muted/50" />
        </CardHeader>
      </Card>
    )
  }

  const isConnected = !!status?.connected
  // Opens Google Calendar pre-selecting the connected account via authuser —
  // there's no reliable deep link straight to a specific calendarId across
  // Google's UI, so this is the best "jump to the associated calendar" we can do.
  const calendarUrl = status?.email
    ? `https://calendar.google.com/calendar/r?authuser=${encodeURIComponent(status.email)}`
    : 'https://calendar.google.com/calendar/r'

  return (
    <Card className="group bg-card/30 backdrop-blur-xl border border-border/50 hover:border-primary/50 transition-all duration-300 shadow-lg hover:shadow-primary/5">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div className="p-2.5 rounded-xl bg-blue-500 bg-opacity-10 text-opacity-100 mb-2 transition-transform group-hover:scale-110 duration-300">
            <Calendar className="h-5 w-5 text-blue-500" />
          </div>
          <Badge variant={isConnected ? "default" : "outline"} className={isConnected ? "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20" : "bg-muted/50 text-muted-foreground"}>
            {isConnected ? "Conectado" : "Desconectado"}
          </Badge>
        </div>
        <CardTitle className="text-lg font-bold tracking-tight">Google Calendar</CardTitle>
        <CardDescription className="text-xs line-clamp-1">
          {isConnected ? `Sincronizando con ${status?.email}` : 'Sincroniza disponibilidad y crea eventos automáticamente'}
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-4 space-y-2">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider font-bold text-muted-foreground/60">
          <span>Método</span>
          <span className="text-foreground/80">OAuth 2.0</span>
        </div>
        {isConnected && calendars.length > 0 && (
          <div className="flex items-center gap-2 pt-1">
            <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/60 shrink-0">Calendario</span>
            <Select value={status?.calendarId ?? 'primary'} onValueChange={handleCalendarChange}>
              <SelectTrigger className="h-7 text-xs flex-1">
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
      </CardContent>
      <CardFooter className="flex gap-2">
        {isConnected ? (
          <>
            <Button variant="outline" size="sm" className="flex-1" asChild>
              <a href={calendarUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5 mr-2" />
                Abrir calendario
              </a>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="text-destructive hover:text-destructive"
            >
              Desconectar
            </Button>
          </>
        ) : (
          <Button
            className="w-full"
            onClick={handleConnect}
            disabled={connecting}
          >
            {connecting ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <ExternalLink className="h-4 w-4 mr-2" />}
            Conectar Ahora
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
