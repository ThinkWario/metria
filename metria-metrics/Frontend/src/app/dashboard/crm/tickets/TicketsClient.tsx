'use client'
import { useState, useEffect } from 'react'
import { fetchAPI } from '@/lib/api'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

const PRIORITY_COLOR: Record<string, string> = {
  URGENT: 'bg-red-100 text-red-700',
  HIGH: 'bg-orange-100 text-orange-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  LOW: 'bg-gray-100 text-gray-600'
}
const STATUS_COLOR: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-purple-100 text-purple-700',
  RESOLVED: 'bg-green-100 text-green-700',
  CLOSED: 'bg-gray-100 text-gray-600'
}
const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Abierto', IN_PROGRESS: 'En progreso', RESOLVED: 'Resuelto', CLOSED: 'Cerrado'
}
const PRIORITY_LABEL: Record<string, string> = {
  URGENT: 'Urgente', HIGH: 'Alta', MEDIUM: 'Media', LOW: 'Baja'
}

interface Ticket {
  id: string; title: string; status: string; priority: string
  slaDeadline: string | null; createdAt: string
  contact: { id: string; name: string; phone: string | null }
}

interface Contact {
  id: string
  name: string
}

interface NewTicketForm {
  title: string
  description: string
  priority: string
  contactId: string
}

const EMPTY_TICKET: NewTicketForm = { title: '', description: '', priority: 'MEDIUM', contactId: '' }

export default function TicketsClient() {
  const [mounted, setMounted] = useState(false)
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<NewTicketForm>(EMPTY_TICKET)
  const [saving, setSaving] = useState(false)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [contactsLoading, setContactsLoading] = useState(false)
  const [contactSearch, setContactSearch] = useState('')

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    const params = new URLSearchParams()
    if (statusFilter) params.set('status', statusFilter)
    if (priorityFilter) params.set('priority', priorityFilter)
    setLoading(true)
    fetchAPI(`/crm/tickets?${params}`)
      .then(setTickets)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [mounted, statusFilter, priorityFilter])

  async function handleStatusChange(ticketId: string, status: string) {
    const prev = tickets.find(t => t.id === ticketId)?.status
    setTickets(ts => ts.map(t => t.id === ticketId ? { ...t, status } : t))
    try {
      await fetchAPI(`/crm/tickets/${ticketId}`, { method: 'PATCH', body: JSON.stringify({ status }) })
      toast.success('Estado actualizado')
    } catch (_err) {
      setTickets(ts => ts.map(t => t.id === ticketId ? { ...t, status: prev ?? t.status } : t))
      toast.error('Error al actualizar el estado')
    }
  }

  async function handlePriorityChange(ticketId: string, priority: string) {
    const prev = tickets.find(t => t.id === ticketId)?.priority
    setTickets(ts => ts.map(t => t.id === ticketId ? { ...t, priority } : t))
    try {
      await fetchAPI(`/crm/tickets/${ticketId}`, { method: 'PATCH', body: JSON.stringify({ priority }) })
      toast.success('Prioridad actualizada')
    } catch (_err) {
      setTickets(ts => ts.map(t => t.id === ticketId ? { ...t, priority: prev ?? t.priority } : t))
      toast.error('Error al actualizar la prioridad')
    }
  }

  async function handleOpenDialog(open: boolean) {
    setDialogOpen(open)
    if (open && contacts.length === 0 && !contactsLoading) {
      setContactsLoading(true)
      try {
        const data = await fetchAPI('/crm/contacts?limit=100')
        const arr: Contact[] = Array.isArray(data) ? data : (data.contacts ?? data.items ?? [])
        setContacts(arr)
      } catch {
        // non-fatal: user sees empty select
      } finally {
        setContactsLoading(false)
      }
    }
    if (!open) {
      setForm(EMPTY_TICKET)
      setContactSearch('')
    }
  }

  async function handleCreateTicket() {
    if (!form.title.trim()) { toast.error('El título es obligatorio'); return }
    if (!form.contactId) { toast.error('Selecciona un contacto'); return }
    setSaving(true)
    try {
      const newTicket = await fetchAPI('/crm/tickets', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          priority: form.priority,
          contactId: form.contactId,
        })
      })
      setTickets(ts => [newTicket, ...ts])
      toast.success('Ticket creado')
      handleOpenDialog(false)
    } catch {
      toast.error('Error al crear el ticket')
    } finally {
      setSaving(false)
    }
  }

  if (!mounted) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 rounded-lg bg-muted/40 animate-pulse" />
        ))}
      </div>
    )
  }

  const now = Date.now()
  const filteredContacts = contactSearch.trim()
    ? contacts.filter(c => c.name.toLowerCase().includes(contactSearch.toLowerCase()))
    : contacts

  return (
    <div className="space-y-4">
      {/* Filters + action */}
      <div className="flex items-center gap-3">
        <select
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
          value={priorityFilter}
          onChange={e => setPriorityFilter(e.target.value)}
        >
          <option value="">Todas las prioridades</option>
          {['URGENT', 'HIGH', 'MEDIUM', 'LOW'].map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        <button
          onClick={() => handleOpenDialog(true)}
          className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nuevo Ticket
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Sin tickets</div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Ticket</th>
                <th className="text-left px-4 py-2 font-medium">Contacto</th>
                <th className="text-center px-4 py-2 font-medium">Prioridad</th>
                <th className="text-center px-4 py-2 font-medium">Estado</th>
                <th className="text-right px-4 py-2 font-medium">SLA</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map(ticket => {
                const isOverdue = ticket.slaDeadline && new Date(ticket.slaDeadline).getTime() < now && ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED'
                return (
                  <tr key={ticket.id} className="border-t hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium">{ticket.title}</td>
                    <td className="px-4 py-3 text-muted-foreground">{ticket.contact.name}</td>
                    <td className="px-4 py-2 text-center">
                      <Select
                        value={ticket.priority}
                        onValueChange={v => handlePriorityChange(ticket.id, v)}
                      >
                        <SelectTrigger
                          className={`h-7 w-28 text-xs font-medium rounded-full border-0 shadow-none px-2 focus:ring-0 ${PRIORITY_COLOR[ticket.priority] ?? 'bg-muted'}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(PRIORITY_LABEL).map(([k, v]) => (
                            <SelectItem key={k} value={k}>
                              <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${PRIORITY_COLOR[k] ?? ''}`}>{v}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <Select
                        value={ticket.status}
                        onValueChange={v => handleStatusChange(ticket.id, v)}
                      >
                        <SelectTrigger
                          className={`h-7 w-36 text-xs font-medium rounded-full border-0 shadow-none px-2 focus:ring-0 ${STATUS_COLOR[ticket.status] ?? 'bg-muted'}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(STATUS_LABEL).map(([k, v]) => (
                            <SelectItem key={k} value={k}>
                              <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${STATUS_COLOR[k] ?? ''}`}>{v}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className={`px-4 py-3 text-right text-xs ${isOverdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                      {ticket.slaDeadline
                        ? new Date(ticket.slaDeadline).toLocaleDateString('es-CL', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : '—'}
                      {isOverdue && ' ⚠'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create ticket dialog */}
      <Dialog open={dialogOpen} onOpenChange={handleOpenDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo Ticket</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Title */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Título <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                placeholder="Describe el problema o solicitud"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') handleCreateTicket() }}
                className="w-full text-sm border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                autoFocus
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Descripción</label>
              <Textarea
                placeholder="Detalles opcionales..."
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={3}
                className="text-sm resize-none"
              />
            </div>

            {/* Priority */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Prioridad</label>
              <select
                value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                className="w-full text-sm border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="URGENT">Urgente</option>
                <option value="HIGH">Alta</option>
                <option value="MEDIUM">Media</option>
                <option value="LOW">Baja</option>
              </select>
            </div>

            {/* Contact */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Contacto <span className="text-destructive">*</span>
              </label>
              {contactsLoading ? (
                <div className="h-9 rounded-lg bg-muted/40 animate-pulse" />
              ) : (
                <>
                  <input
                    type="text"
                    placeholder="Buscar contacto..."
                    value={contactSearch}
                    onChange={e => setContactSearch(e.target.value)}
                    className="w-full text-sm border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  {(contactSearch.trim() || form.contactId) && (
                    <select
                      size={Math.min(filteredContacts.length, 5) || 1}
                      value={form.contactId}
                      onChange={e => {
                        setForm(f => ({ ...f, contactId: e.target.value }))
                        const c = contacts.find(x => x.id === e.target.value)
                        if (c) setContactSearch(c.name)
                      }}
                      className="w-full text-sm border rounded-lg px-2 py-1 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {filteredContacts.length === 0
                        ? <option value="" disabled>Sin resultados</option>
                        : filteredContacts.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))
                      }
                    </select>
                  )}
                </>
              )}
            </div>
          </div>

          <DialogFooter>
            <button
              onClick={() => handleOpenDialog(false)}
              className="px-4 py-2 rounded-lg border text-sm font-medium hover:bg-muted/50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleCreateTicket}
              disabled={saving || !form.title.trim() || !form.contactId}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
            >
              {saving ? 'Creando...' : 'Crear Ticket'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
