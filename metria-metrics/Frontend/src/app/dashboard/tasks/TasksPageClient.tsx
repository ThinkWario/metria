'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { CheckCircle2, Circle, AlertCircle, Clock, CalendarDays, CheckSquare } from 'lucide-react'
import { fetchAPI } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────────

type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
type FilterType = 'today' | 'overdue' | 'upcoming' | 'all'

interface Contact {
  id: string
  name: string
}

interface Task {
  id: string
  title: string
  priority: TaskPriority
  dueAt: string | null
  completedAt: string | null
  contactId: string
  workspaceId: string
  contact: Contact
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; className: string }> = {
  URGENT: { label: 'Urgente',  className: 'bg-red-500/15 text-red-600 border-red-500/30' },
  HIGH:   { label: 'Alta',     className: 'bg-orange-500/15 text-orange-600 border-orange-500/30' },
  MEDIUM: { label: 'Media',    className: 'bg-blue-500/15 text-blue-600 border-blue-500/30' },
  LOW:    { label: 'Baja',     className: 'bg-muted text-muted-foreground border-border' },
}

function formatDate(dateStr: string | null): string | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
}

function getDueDateStatus(dueAt: string | null): 'overdue' | 'today' | 'future' | null {
  if (!dueAt) return null
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  const d = new Date(dueAt)
  if (d < start) return 'overdue'
  if (d >= start && d < end) return 'today'
  return 'future'
}

function todayLabel(): string {
  return new Date().toLocaleDateString('es-CL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

// ── Empty State ────────────────────────────────────────────────────────────────

const EMPTY_MESSAGES: Record<FilterType, string> = {
  today:    'No hay tareas para hoy 🎉',
  overdue:  'Sin tareas vencidas ✅',
  upcoming: 'No hay tareas próximas',
  all:      'No hay tareas pendientes',
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function TaskSkeleton() {
  return (
    <div className="flex items-start gap-3 p-4 border rounded-xl">
      <Skeleton className="h-5 w-5 rounded-full mt-0.5 shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
      </div>
    </div>
  )
}

// ── Task Item ──────────────────────────────────────────────────────────────────

function TaskItem({
  task,
  onComplete,
}: {
  task: Task
  onComplete: (id: string) => void
}) {
  const [completing, setCompleting] = useState(false)
  const dueDateStatus = getDueDateStatus(task.dueAt)
  const priorityCfg = PRIORITY_CONFIG[task.priority]

  async function handleComplete() {
    setCompleting(true)
    try {
      await fetchAPI(`/crm/tasks/${task.id}/complete`, { method: 'PATCH' })
      onComplete(task.id)
      toast.success('Tarea completada')
    } catch {
      toast.error('Error al completar la tarea')
      setCompleting(false)
    }
  }

  return (
    <div className="flex items-start gap-3 p-4 border rounded-xl bg-card hover:bg-accent/30 transition-colors group">
      {/* Checkbox */}
      <button
        onClick={handleComplete}
        disabled={completing}
        className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
        aria-label="Completar tarea"
      >
        {completing
          ? <CheckCircle2 className="h-5 w-5 text-primary" />
          : <Circle className="h-5 w-5" />
        }
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1.5">
        <p className={cn('text-sm font-medium leading-snug', completing && 'line-through text-muted-foreground')}>
          {task.title}
        </p>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* Priority */}
          <Badge variant="outline" className={cn('text-xs font-medium px-2 py-0.5', priorityCfg.className)}>
            {priorityCfg.label}
          </Badge>

          {/* Due date */}
          {task.dueAt && (
            <span className={cn(
              'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium',
              dueDateStatus === 'overdue' && 'bg-red-500/10 text-red-600 border-red-400/30',
              dueDateStatus === 'today'   && 'bg-amber-500/10 text-amber-600 border-amber-400/30',
              dueDateStatus === 'future'  && 'bg-muted text-muted-foreground border-border',
            )}>
              {dueDateStatus === 'overdue' && <AlertCircle className="h-3 w-3" />}
              {dueDateStatus === 'today'   && <Clock className="h-3 w-3" />}
              {dueDateStatus === 'future'  && <CalendarDays className="h-3 w-3" />}
              {formatDate(task.dueAt)}
            </span>
          )}

          {/* Contact link */}
          <Link
            href={`/dashboard/crm/contacts/${task.contact.id}`}
            className="text-xs text-muted-foreground hover:text-primary transition-colors underline underline-offset-2"
          >
            {task.contact.name}
          </Link>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'today',    label: 'Hoy' },
  { key: 'overdue',  label: 'Vencidas' },
  { key: 'upcoming', label: 'Próximas' },
  { key: 'all',      label: 'Todas' },
]

export default function TasksPageClient() {
  const [mounted, setMounted] = useState(false)
  const [filter, setFilter] = useState<FilterType>('today')
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [counts, setCounts] = useState<Record<FilterType, number | null>>({
    today: null, overdue: null, upcoming: null, all: null,
  })

  useEffect(() => { setMounted(true) }, [])

  const fetchTasks = useCallback(async (f: FilterType) => {
    setLoading(true)
    try {
      const data: Task[] = await fetchAPI(`/crm/tasks?filter=${f}`)
      setTasks(data)
      setCounts(prev => ({ ...prev, [f]: data.length }))
    } catch {
      toast.error('Error al cargar las tareas')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (mounted) fetchTasks(filter)
  }, [mounted, filter, fetchTasks])

  function handleTabChange(f: FilterType) {
    if (f === filter) return
    setFilter(f)
    setTasks([])
  }

  function handleComplete(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id))
    setCounts(prev => ({
      ...prev,
      [filter]: prev[filter] !== null ? Math.max(0, (prev[filter] as number) - 1) : null,
    }))
  }

  if (!mounted) return null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <CheckSquare className="h-6 w-6 text-primary" />
          Mis Tareas
        </h1>
        <p className="text-sm text-muted-foreground mt-1 capitalize">{todayLabel()}</p>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 flex-wrap">
        {FILTERS.map(({ key, label }) => (
          <Button
            key={key}
            variant={filter === key ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleTabChange(key)}
            className="gap-1.5"
          >
            {label}
            {counts[key] !== null && (
              <span className={cn(
                'inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full text-[10px] font-bold',
                filter === key
                  ? 'bg-primary-foreground/20 text-primary-foreground'
                  : 'bg-muted text-muted-foreground',
              )}>
                {counts[key]}
              </span>
            )}
          </Button>
        ))}
      </div>

      {/* Task List */}
      <div className="space-y-2">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <TaskSkeleton key={i} />)
        ) : tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center border rounded-xl bg-card">
            <CheckCircle2 className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">{EMPTY_MESSAGES[filter]}</p>
          </div>
        ) : (
          tasks.map(task => (
            <TaskItem key={task.id} task={task} onComplete={handleComplete} />
          ))
        )}
      </div>
    </div>
  )
}
