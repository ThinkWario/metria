'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { fetchAPI } from '@/lib/api'

const STATUS_COLOR: Record<string, string> = {
  LEAD: 'bg-blue-100 text-blue-700',
  PROSPECT: 'bg-purple-100 text-purple-700',
  CUSTOMER: 'bg-green-100 text-green-700',
  VIP: 'bg-yellow-100 text-yellow-700',
  CHURNED: 'bg-red-100 text-red-700'
}

const STATUS_LABEL: Record<string, string> = {
  LEAD: 'Lead', PROSPECT: 'Prospecto', CUSTOMER: 'Cliente', VIP: 'VIP', CHURNED: 'Inactivo'
}

interface Contact {
  id: string
  name: string
  email: string | null
  phone: string | null
  status: string
  ltv: string
  healthScore: number | null
  source: string
  tags: { id: string; name: string; color: string }[]
  _count: { conversations: number; deals: number; tickets: number }
}

export default function CrmContactsClient() {
  const [mounted, setMounted] = useState(false)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const router = useRouter()

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (statusFilter) params.set('status', statusFilter)
    setLoading(true)
    fetchAPI(`/crm/contacts?${params}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(setContacts)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [mounted, search, statusFilter])

  if (!mounted) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14 rounded-lg bg-muted/40 animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          className="flex-1 max-w-sm border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
          placeholder="Buscar por nombre, email o teléfono..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : contacts.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Sin contactos</div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Contacto</th>
                <th className="text-left px-4 py-2 font-medium">Estado</th>
                <th className="text-right px-4 py-2 font-medium">LTV</th>
                <th className="text-center px-4 py-2 font-medium">Conv.</th>
                <th className="text-center px-4 py-2 font-medium">Deals</th>
                <th className="text-center px-4 py-2 font-medium">Tickets</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map(c => (
                <tr
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/dashboard/crm/contacts/${c.id}`)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') router.push(`/dashboard/crm/contacts/${c.id}`) }}
                  className="border-t hover:bg-muted/30 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{c.phone ?? c.email ?? '—'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[c.status] ?? 'bg-muted text-muted-foreground'}`}>
                      {STATUS_LABEL[c.status] ?? c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs">${Number(c.ltv).toFixed(2)}</td>
                  <td className="px-4 py-3 text-center text-muted-foreground">{c._count.conversations}</td>
                  <td className="px-4 py-3 text-center text-muted-foreground">{c._count.deals}</td>
                  <td className="px-4 py-3 text-center text-muted-foreground">{c._count.tickets}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
