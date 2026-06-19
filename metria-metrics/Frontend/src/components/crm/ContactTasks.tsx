'use client'
import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2, Plus, CheckCircle2, Circle } from 'lucide-react'
import { toast } from 'sonner'
import {
  getContactTasks, createContactTask, updateContactTask, deleteContactTask,
  type ContactTask
} from '@/lib/crm-timeline-api'

const PRIORITY_BADGE: Record<string, string> = {
  LOW:    'bg-slate-100 text-slate-600',
  MEDIUM: 'bg-blue-100 text-blue-600',
  HIGH:   'bg-amber-100 text-amber-700',
  URGENT: 'bg-red-100 text-red-700'
}

const PRIORITY_LABEL: Record<string, string> = {
  LOW: 'Baja', MEDIUM: 'Media', HIGH: 'Alta', URGENT: 'Urgente'
}

function isOverdue(dueAt?: string, completedAt?: string) {
  if (!dueAt || completedAt) return false
  return new Date(dueAt) < new Date()
}

function formatDate(dateStr?: string) {
  if (!dateStr) return null
  return new Date(dateStr).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
}

function toDateInputValue(isoStr?: string) {
  if (!isoStr) return ''
  return isoStr.split('T')[0]
}

interface NewTaskForm {
  title: string
  dueAt: string
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
}

const EMPTY_FORM: NewTaskForm = { title: '', dueAt: '', priority: 'MEDIUM' }

export default function ContactTasks({ contactId }: { contactId: string }) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<NewTaskForm>(EMPTY_FORM)

  // Inline edit state
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editingDueAtId, setEditingDueAtId] = useState<string | null>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['contact-tasks', contactId],
    queryFn: () => getContactTasks(contactId),
    staleTime: 30_000
  })

  const createMutation = useMutation({
    mutationFn: (data: NewTaskForm) =>
      createContactTask(contactId, {
        title: data.title,
        dueAt: data.dueAt || undefined,
        priority: data.priority
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact-tasks', contactId] })
      setForm(EMPTY_FORM)
      setShowForm(false)
    }
  })

  const toggleMutation = useMutation({
    mutationFn: (task: ContactTask) =>
      updateContactTask(task.id, {
        completedAt: task.completedAt ? null : new Date().toISOString()
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contact-tasks', contactId] })
  })

  const updateMutation = useMutation({
    mutationFn: ({ taskId, data }: { taskId: string; data: Parameters<typeof updateContactTask>[1] }) =>
      updateContactTask(taskId, data),
    onSuccess: (_result, { taskId, data }) => {
      qc.setQueryData<ContactTask[]>(['contact-tasks', contactId], old =>
        old?.map(t => t.id === taskId ? { ...t, ...(data as Partial<ContactTask>) } : t) ?? []
      )
      toast.success('Tarea actualizada')
    },
    onError: () => toast.error('Error al actualizar la tarea')
  })

  const deleteMutation = useMutation({
    mutationFn: (taskId: string) => deleteContactTask(taskId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contact-tasks', contactId] })
  })

  function commitTitleEdit(task: ContactTask) {
    const trimmed = editTitle.trim()
    setEditingTitleId(null)
    if (trimmed && trimmed !== task.title) {
      updateMutation.mutate({ taskId: task.id, data: { title: trimmed } })
    }
  }

  // Sort: incomplete first (by dueAt), then completed
  const sorted = [...tasks].sort((a, b) => {
    const aComplete = !!a.completedAt
    const bComplete = !!b.completedAt
    if (aComplete !== bComplete) return aComplete ? 1 : -1
    if (!a.dueAt && !b.dueAt) return 0
    if (!a.dueAt) return 1
    if (!b.dueAt) return -1
    return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
  })

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Tareas</h3>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Nueva Tarea
        </button>
      </div>

      {/* Inline new-task form */}
      {showForm && (
        <div className="rounded-lg border p-4 space-y-3 bg-muted/20">
          <input
            type="text"
            placeholder="Título de la tarea *"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            className="w-full text-sm border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex gap-2">
            <input
              type="date"
              value={form.dueAt}
              onChange={e => setForm(f => ({ ...f, dueAt: e.target.value }))}
              className="flex-1 text-sm border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <select
              value={form.priority}
              onChange={e => setForm(f => ({ ...f, priority: e.target.value as NewTaskForm['priority'] }))}
              className="flex-1 text-sm border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="LOW">Baja</option>
              <option value="MEDIUM">Media</option>
              <option value="HIGH">Alta</option>
              <option value="URGENT">Urgente</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (!form.title.trim()) return
                createMutation.mutate(form)
              }}
              disabled={!form.title.trim() || createMutation.isPending}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 transition-colors"
            >
              {createMutation.isPending ? 'Guardando...' : 'Guardar'}
            </button>
            <button
              onClick={() => { setShowForm(false); setForm(EMPTY_FORM) }}
              className="px-4 py-2 rounded-lg border text-sm font-medium hover:bg-muted/50 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Task list */}
      {isLoading ? (
        <div className="space-y-2 animate-pulse">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 bg-muted/40 rounded-lg" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Sin tareas. Crea la primera.</p>
      ) : (
        <div className="space-y-2">
          {sorted.map(task => {
            const overdue = isOverdue(task.dueAt, task.completedAt)
            const completed = !!task.completedAt
            const isEditingTitle = editingTitleId === task.id
            const isEditingDueAt = editingDueAtId === task.id

            return (
              <div
                key={task.id}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                  completed ? 'opacity-60 bg-muted/10' : 'bg-background'
                }`}
              >
                {/* Checkbox */}
                <button
                  onClick={() => toggleMutation.mutate(task)}
                  disabled={toggleMutation.isPending}
                  className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                  aria-label={completed ? 'Marcar incompleta' : 'Marcar completa'}
                >
                  {completed
                    ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    : <Circle className="w-5 h-5" />
                  }
                </button>

                {/* Title — click to edit */}
                {isEditingTitle ? (
                  <input
                    ref={titleInputRef}
                    autoFocus
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    onBlur={() => commitTitleEdit(task)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); commitTitleEdit(task) }
                      if (e.key === 'Escape') { setEditingTitleId(null) }
                    }}
                    className="flex-1 text-sm border rounded px-2 py-0.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                ) : (
                  <span
                    role="button"
                    tabIndex={0}
                    className={`flex-1 text-sm ${
                      completed
                        ? 'line-through text-muted-foreground'
                        : 'cursor-pointer hover:underline decoration-dotted underline-offset-2'
                    }`}
                    onClick={() => {
                      if (completed) return
                      setEditingTitleId(task.id)
                      setEditTitle(task.title)
                    }}
                    onKeyDown={e => {
                      if ((e.key === 'Enter' || e.key === ' ') && !completed) {
                        e.preventDefault()
                        setEditingTitleId(task.id)
                        setEditTitle(task.title)
                      }
                    }}
                  >
                    {task.title}
                  </span>
                )}

                {/* Priority — always a select, styled as badge */}
                <select
                  value={task.priority}
                  disabled={updateMutation.isPending}
                  onChange={e => updateMutation.mutate({ taskId: task.id, data: { priority: e.target.value } })}
                  className={`text-xs px-2 py-0.5 rounded-full font-medium border-0 cursor-pointer appearance-none focus:outline-none focus:ring-1 focus:ring-ring ${
                    PRIORITY_BADGE[task.priority] ?? 'bg-muted text-muted-foreground'
                  }`}
                >
                  <option value="LOW">Baja</option>
                  <option value="MEDIUM">Media</option>
                  <option value="HIGH">Alta</option>
                  <option value="URGENT">Urgente</option>
                </select>

                {/* Due date — click chip to edit */}
                {task.dueAt && (
                  isEditingDueAt ? (
                    <input
                      type="date"
                      autoFocus
                      defaultValue={toDateInputValue(task.dueAt)}
                      onBlur={() => setEditingDueAtId(null)}
                      onChange={e => {
                        const val = e.target.value
                        if (val) {
                          updateMutation.mutate({
                            taskId: task.id,
                            data: { dueAt: new Date(val).toISOString() }
                          })
                          setEditingDueAtId(null)
                        }
                      }}
                      className="text-xs border rounded px-1.5 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring w-32"
                    />
                  ) : (
                    <span
                      role="button"
                      tabIndex={0}
                      title="Haz clic para editar la fecha"
                      onClick={() => setEditingDueAtId(task.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setEditingDueAtId(task.id)
                        }
                      }}
                      className={`text-xs px-2 py-0.5 rounded-full cursor-pointer hover:ring-1 hover:ring-ring transition-all ${
                        overdue ? 'bg-red-100 text-red-700' : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {formatDate(task.dueAt)}
                    </span>
                  )
                )}

                {/* Delete */}
                <button
                  onClick={() => deleteMutation.mutate(task.id)}
                  disabled={deleteMutation.isPending}
                  className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                  aria-label="Eliminar tarea"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
