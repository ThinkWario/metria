'use client'
import { useState, useEffect } from 'react'
import { fetchAPI } from '@/lib/api'

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

interface Ticket {
  id: string; title: string; status: string; priority: string
  slaDeadline: string | null; createdAt: string
  contact: { id: string; name: string; phone: string | null }
}

export default function TicketsClient() {
  const [mounted, setMounted] = useState(false)
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [resolvingId, setResolvingId] = useState<string | null>(null)

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

  async function handleResolve(ticketId: string) {
    setResolvingId(ticketId)
    try {
      await fetchAPI(`/crm/tickets/${ticketId}/resolve`, { method: 'POST' })
      setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: 'RESOLVED' } : t))
    } catch (err) {
      console.error(err)
    } finally {
      setResolvingId(null)
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

  return (
    <div className="space-y-4">
      {/* Filters */}
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
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {tickets.map(ticket => {
                const isOverdue = ticket.slaDeadline && new Date(ticket.slaDeadline).getTime() < now && ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED'
                return (
                  <tr key={ticket.id} className="border-t hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium">{ticket.title}</td>
                    <td className="px-4 py-3 text-muted-foreground">{ticket.contact.name}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PRIORITY_COLOR[ticket.priority] ?? 'bg-muted'}`}>
                        {ticket.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[ticket.status] ?? 'bg-muted'}`}>
                        {STATUS_LABEL[ticket.status] ?? ticket.status}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-right text-xs ${isOverdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                      {ticket.slaDeadline
                        ? new Date(ticket.slaDeadline).toLocaleDateString('es-CL', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : '—'}
                      {isOverdue && ' ⚠'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {ticket.status !== 'RESOLVED' && ticket.status !== 'CLOSED' && (
                        <button
                          onClick={() => handleResolve(ticket.id)}
                          disabled={resolvingId === ticket.id}
                          className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50 transition-colors"
                        >
                          {resolvingId === ticket.id ? '...' : 'Resolver'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
