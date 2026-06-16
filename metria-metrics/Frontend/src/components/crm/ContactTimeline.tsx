'use client'
import { useQuery } from '@tanstack/react-query'
import {
  MessageSquare, StickyNote, DollarSign, ArrowRight, Trophy,
  X, CheckSquare, CheckCircle2, Bot, UserCog, type LucideIcon
} from 'lucide-react'
import { getContactEvents, type ContactEvent } from '@/lib/crm-timeline-api'

const EVENT_CONFIG: Record<string, { icon: LucideIcon; color: string; bg: string }> = {
  MESSAGE_SENT:        { icon: MessageSquare, color: 'text-blue-600',    bg: 'bg-blue-100' },
  MESSAGE_RECEIVED:    { icon: MessageSquare, color: 'text-blue-600',    bg: 'bg-blue-100' },
  NOTE_ADDED:          { icon: StickyNote,    color: 'text-amber-600',   bg: 'bg-amber-100' },
  DEAL_CREATED:        { icon: DollarSign,    color: 'text-emerald-600', bg: 'bg-emerald-100' },
  DEAL_STAGE_CHANGED:  { icon: ArrowRight,    color: 'text-slate-600',   bg: 'bg-slate-100' },
  DEAL_WON:            { icon: Trophy,        color: 'text-emerald-600', bg: 'bg-emerald-100' },
  DEAL_LOST:           { icon: X,             color: 'text-red-600',     bg: 'bg-red-100' },
  TASK_CREATED:        { icon: CheckSquare,   color: 'text-violet-600',  bg: 'bg-violet-100' },
  TASK_COMPLETED:      { icon: CheckCircle2,  color: 'text-emerald-600', bg: 'bg-emerald-100' },
  AI_QUALIFICATION:    { icon: Bot,           color: 'text-purple-600',  bg: 'bg-purple-100' },
  STATUS_CHANGED:      { icon: UserCog,       color: 'text-slate-600',   bg: 'bg-slate-100' },
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'hace un momento'
  if (mins < 60) return `hace ${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `hace ${hrs} h`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `hace ${days} d`
  return new Date(dateStr).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

function TimelineSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-4 items-start">
          <div className="w-8 h-8 rounded-full bg-muted/50 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-2/3 bg-muted/50 rounded" />
            <div className="h-3 w-1/2 bg-muted/40 rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyTimeline() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
      <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center">
        <MessageSquare className="w-7 h-7 text-muted-foreground/50" />
      </div>
      <p className="text-sm font-medium text-muted-foreground">Sin actividad registrada aún</p>
      <p className="text-xs text-muted-foreground/60">Los eventos aparecerán aquí a medida que interactúes con este contacto.</p>
    </div>
  )
}

function EventCard({ event }: { event: ContactEvent }) {
  const cfg = EVENT_CONFIG[event.type] ?? { icon: MessageSquare, color: 'text-slate-600', bg: 'bg-slate-100' }
  const Icon = cfg.icon

  return (
    <div className="flex gap-3 items-start">
      {/* Icon dot */}
      <div className={`w-8 h-8 rounded-full ${cfg.bg} flex items-center justify-center shrink-0 mt-0.5 z-10`}>
        <Icon className={`w-4 h-4 ${cfg.color}`} />
      </div>
      {/* Content */}
      <div className="flex-1 min-w-0 pb-4">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-medium leading-snug truncate">{event.title}</p>
          <span className="text-xs text-muted-foreground shrink-0">{relativeTime(event.createdAt)}</span>
        </div>
        {event.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{event.description}</p>
        )}
      </div>
    </div>
  )
}

export default function ContactTimeline({ contactId }: { contactId: string }) {
  const { data: events, isLoading, error } = useQuery({
    queryKey: ['contact-events', contactId],
    queryFn: () => getContactEvents(contactId),
    staleTime: 30_000
  })

  if (isLoading) return <TimelineSkeleton />

  if (error) {
    return (
      <p className="text-sm text-destructive py-4">Error al cargar la actividad.</p>
    )
  }

  if (!events || events.length === 0) return <EmptyTimeline />

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-4 top-4 bottom-0 w-px bg-border" aria-hidden />
      <div className="space-y-0">
        {events.map(event => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
    </div>
  )
}
