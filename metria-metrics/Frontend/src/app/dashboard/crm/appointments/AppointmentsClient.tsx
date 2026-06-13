'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchAPI } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CalendarDays, Clock, Phone, User, Wrench, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

interface Appointment {
  id: string
  type: string
  scheduledAt: string
  durationMin: number
  status: string
  notes: string | null
  contact: { id: string; name: string; phone: string | null }
}

const TYPE_LABELS: Record<string, string> = {
  SITE_VISIT: 'Visita técnica',
  CALL: 'Llamada'
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'SCHEDULED', label: 'Agendada' },
  { value: 'CONFIRMED', label: 'Confirmada' },
  { value: 'COMPLETED', label: 'Completada' },
  { value: 'CANCELLED', label: 'Cancelada' },
  { value: 'NO_SHOW', label: 'No asistió' }
]

const STATUS_STYLES: Record<string, string> = {
  SCHEDULED: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  CONFIRMED: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  COMPLETED: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
  CANCELLED: 'bg-red-500/10 text-red-500 border-red-500/20',
  NO_SHOW: 'bg-amber-500/10 text-amber-500 border-amber-500/20'
}

function dayHeading(iso: string): string {
  const label = new Date(iso).toLocaleDateString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function dayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function AppointmentsClient() {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    fetchAPI('/appointments')
      .then(data => { if (active) setAppointments(Array.isArray(data) ? data : []) })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : 'Error al cargar las citas') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [reloadKey])

  const retry = useCallback(() => {
    setLoading(true)
    setError(null)
    setReloadKey(k => k + 1)
  }, [])

  async function handleStatusChange(id: string, status: string) {
    const previous = appointments
    // Optimistic update
    setAppointments(prev => prev.map(a => a.id === id ? { ...a, status } : a))
    try {
      await fetchAPI(`/appointments/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      })
      const label = STATUS_OPTIONS.find(o => o.value === status)?.label ?? status
      toast.success(`Cita actualizada a "${label}"`)
    } catch (err) {
      setAppointments(previous)
      toast.error(err instanceof Error ? err.message : 'No se pudo actualizar la cita')
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-64" />
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
        <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
          <AlertTriangle className="w-7 h-7" />
        </div>
        <h3 className="font-bold text-lg text-foreground">No pudimos cargar las citas</h3>
        <p className="text-sm text-muted-foreground max-w-xs">{error}</p>
        <Button variant="outline" className="rounded-xl" onClick={retry}>Reintentar</Button>
      </div>
    )
  }

  if (appointments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
          <CalendarDays className="w-7 h-7" />
        </div>
        <h3 className="font-bold text-lg text-foreground">Sin citas agendadas</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          Cuando tu agente o tu equipo agenden visitas o llamadas, aparecerán aquí.
        </p>
        <Button variant="outline" className="rounded-xl gap-2 mt-2" onClick={() => window.open('https://wa.me/', '_blank')}>
          <Phone className="w-4 h-4" /> Agendar por WhatsApp
        </Button>
      </div>
    )
  }

  // Group by day, preserving the ascending order returned by the API
  const groups: { key: string; heading: string; items: Appointment[] }[] = []
  for (const appt of appointments) {
    const key = dayKey(appt.scheduledAt)
    const existing = groups.find(g => g.key === key)
    if (existing) existing.items.push(appt)
    else groups.push({ key, heading: dayHeading(appt.scheduledAt), items: [appt] })
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {groups.map(group => (
        <section key={group.key} className="space-y-3">
          <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <CalendarDays className="w-4 h-4" /> {group.heading}
          </h2>
          <div className="space-y-3">
            {group.items.map(appt => (
              <Card key={appt.id} className="border-border/40 bg-card/50 backdrop-blur-sm rounded-2xl hover:border-primary/40 transition-colors">
                <CardContent className="p-4 flex flex-col md:flex-row md:items-center gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="p-2.5 rounded-xl bg-muted/50 text-primary shrink-0">
                      {appt.type === 'CALL' ? <Phone className="w-5 h-5" /> : <Wrench className="w-5 h-5" />}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-bold text-foreground flex items-center gap-1.5 truncate">
                        <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> {appt.contact?.name ?? 'Contacto'}
                      </span>
                      <span className="text-xs text-muted-foreground">{appt.contact?.phone ?? 'Sin teléfono'}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    <Badge variant="outline" className="rounded-lg">
                      {TYPE_LABELS[appt.type] ?? appt.type}
                    </Badge>
                    <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      {new Date(appt.scheduledAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                      <span className="text-xs text-muted-foreground">({appt.durationMin} min)</span>
                    </span>
                    <Select value={appt.status} onValueChange={value => handleStatusChange(appt.id, value)}>
                      <SelectTrigger className={`w-[150px] rounded-xl border text-xs font-bold ${STATUS_STYLES[appt.status] ?? ''}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map(opt => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
