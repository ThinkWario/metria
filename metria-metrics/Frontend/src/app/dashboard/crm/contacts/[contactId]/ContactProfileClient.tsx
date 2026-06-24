'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { fetchAPI } from '@/lib/api'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import ContactTimeline from '@/components/crm/ContactTimeline'
import ContactTasks from '@/components/crm/ContactTasks'
import { Trophy, Wallet, ShoppingBag, GitBranch, Pencil, TrendingUp } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'

/** Compact CLP formatter — mirrors PipelineForecast / PipelinesClient idiom. */
function formatCLP(n: number): string {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return '$' + Math.round(n / 1_000) + 'K'
  return '$' + Math.round(n).toLocaleString('es-CL')
}

interface ContactValue {
  ltv: number
  wonDealsValue: number
  wonDealsCount: number
  openPipelineValue: number
  openDealsCount: number
  lostDealsCount: number
  capturedValue: number
  ordersTotal?: number
  ordersCount?: number
}

interface RevenueSummary {
  contactRevenue: {
    totalRevenue: number
    orderCount: number
    lastPurchaseDate: string | null
    avgOrderValue: number
  }
  workspaceContext: {
    avgROAS: number | null
    totalAdSpend30d: number
    totalRevenue30d: number
    netProfit30d: number
  }
  contactAttribution: {
    source: string | null
    estimatedAdCost: null
    note: string
  }
}

const STATUS_COLOR: Record<string, string> = {
  LEAD: 'bg-blue-100 text-blue-700', PROSPECT: 'bg-purple-100 text-purple-700',
  CUSTOMER: 'bg-green-100 text-green-700', VIP: 'bg-yellow-100 text-yellow-700',
  CHURNED: 'bg-red-100 text-red-700'
}
const STATUS_LABEL: Record<string, string> = {
  LEAD: 'Lead', PROSPECT: 'Prospecto', CUSTOMER: 'Cliente', VIP: 'VIP', CHURNED: 'Inactivo'
}
const TICKET_PRIORITY_COLOR: Record<string, string> = {
  URGENT: 'bg-red-100 text-red-700', HIGH: 'bg-orange-100 text-orange-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700', LOW: 'bg-gray-100 text-gray-700'
}
const PLATFORM_LABEL: Record<string, string> = {
  WHATSAPP: 'WhatsApp', INSTAGRAM: 'Instagram', TELEGRAM: 'Telegram'
}
const TEMP_COLOR: Record<string, string> = {
  COLD: 'bg-blue-100 text-blue-700', WARM: 'bg-orange-100 text-orange-700', HOT: 'bg-red-100 text-red-700'
}
const LEAD_TYPE_COLOR: Record<string, string> = {
  CURIOUS: 'bg-purple-100 text-purple-700', QUOTING: 'bg-indigo-100 text-indigo-700',
  READY_TO_BUY: 'bg-green-100 text-green-700', POST_SALE: 'bg-teal-100 text-teal-700'
}

type Tab = 'resumen' | 'conversaciones' | 'deals' | 'tickets' | 'notas' | 'actividad' | 'tareas'

interface Contact {
  id: string; name: string; email: string | null; phone: string | null; status: string
  ltv: string; healthScore: number | null; source: string; createdAt: string
  leadScore: number | null; leadTemperature: string | null; leadType: string | null
  tags: { id: string; name: string; color: string }[]
  contactNotes: { id: string; content: string; createdAt: string; userId: string }[]
  deals: { id: string; title: string; value: string; status: string; stage: { name: string; color: string } }[]
  tickets: { id: string; title: string; status: string; priority: string; createdAt: string; slaDeadline: string | null }[]
  conversations: { id: string; status: string; messageCount: number; lastMessageAt: string | null; channel: { platform: string; name: string } }[]
}

export default function ContactProfileClient({ contactId }: { contactId: string }) {
  const [mounted, setMounted] = useState(false)
  const [contact, setContact] = useState<Contact | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('resumen')
  const [noteContent, setNoteContent] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [value, setValue] = useState<ContactValue | null>(null)
  const [valueLoading, setValueLoading] = useState(true)
  const [valueError, setValueError] = useState(false)
  const [revenue, setRevenue] = useState<RevenueSummary | null>(null)
  const [revenueLoading, setRevenueLoading] = useState(true)
  const [revenueError, setRevenueError] = useState(false)
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    fetchAPI(`/crm/contacts/${contactId}`)
      .then(setContact)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [mounted, contactId])

  useEffect(() => {
    if (!mounted) return
    setValueLoading(true)
    setValueError(false)
    fetchAPI(`/crm/contacts/${contactId}/value`)
      .then(setValue)
      .catch(() => setValueError(true))
      .finally(() => setValueLoading(false))
  }, [mounted, contactId])

  useEffect(() => {
    if (!mounted) return
    setRevenueLoading(true)
    setRevenueError(false)
    fetchAPI(`/crm/contacts/${contactId}/revenue-summary`)
      .then(setRevenue)
      .catch(() => setRevenueError(true))
      .finally(() => setRevenueLoading(false))
  }, [mounted, contactId])

  async function handleStatusChange(newStatus: string) {
    if (!contact || newStatus === contact.status) return
    const prevStatus = contact.status
    setContact(prev => prev ? { ...prev, status: newStatus } : prev)
    try {
      await fetchAPI(`/crm/contacts/${contactId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus })
      })
      toast.success('Estado actualizado')
    } catch {
      setContact(prev => prev ? { ...prev, status: prevStatus } : prev)
      toast.error('Error al actualizar el estado')
    }
  }

  async function handleAddNote() {
    if (!noteContent.trim()) return
    setSavingNote(true)
    try {
      const newNote = await fetchAPI(`/crm/contacts/${contactId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ content: noteContent.trim() })
      })
      setContact(prev => prev ? { ...prev, contactNotes: [newNote, ...prev.contactNotes] } : prev)
      setNoteContent('')
    } catch (err) {
      console.error(err)
    } finally {
      setSavingNote(false)
    }
  }

  function openEditDialog() {
    if (!contact) return
    setEditName(contact.name)
    setEditEmail(contact.email ?? '')
    setEditPhone(contact.phone?.split('@')[0] ?? '')
    setEditOpen(true)
  }

  async function handleEditSave() {
    if (!contact || savingEdit) return
    const newName = editName.trim()
    if (!newName) { toast.error('El nombre no puede estar vacío'); return }
    setSavingEdit(true)
    const prev = { name: contact.name, email: contact.email, phone: contact.phone }
    const payload = { name: newName, email: editEmail.trim() || null, phone: editPhone.trim() || null }
    setContact(c => c ? { ...c, ...payload } : c)
    try {
      await fetchAPI(`/crm/contacts/${contactId}`, { method: 'PATCH', body: JSON.stringify(payload) })
      toast.success('Contacto actualizado')
      setEditOpen(false)
    } catch {
      setContact(c => c ? { ...c, ...prev } : c)
      toast.error('Error al actualizar el contacto')
    } finally { setSavingEdit(false) }
  }

  async function handleTemperatureChange(newVal: string) {
    if (!contact) return
    const temperature: string | null = newVal || null
    if (temperature === contact.leadTemperature) return
    const prev = contact.leadTemperature
    setContact(c => c ? { ...c, leadTemperature: temperature } : c)
    try {
      await fetchAPI(`/crm/contacts/${contactId}`, { method: 'PATCH', body: JSON.stringify({ temperature }) })
      toast.success('Temperatura actualizada')
    } catch {
      setContact(c => c ? { ...c, leadTemperature: prev } : c)
      toast.error('Error al actualizar la temperatura')
    }
  }

  async function handleContactTypeChange(newVal: string) {
    if (!contact) return
    const contactType: string | null = newVal || null
    if (contactType === contact.leadType) return
    const prev = contact.leadType
    setContact(c => c ? { ...c, leadType: contactType } : c)
    try {
      await fetchAPI(`/crm/contacts/${contactId}`, { method: 'PATCH', body: JSON.stringify({ contactType }) })
      toast.success('Tipo de contacto actualizado')
    } catch {
      setContact(c => c ? { ...c, leadType: prev } : c)
      toast.error('Error al actualizar el tipo de contacto')
    }
  }

  if (!mounted || loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-muted/40 rounded" />
        <div className="h-32 bg-muted/40 rounded-lg" />
        <div className="h-64 bg-muted/40 rounded-lg" />
      </div>
    )
  }

  if (!contact) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        Contacto no encontrado.{' '}
        <button className="underline" onClick={() => router.back()}>Volver</button>
      </div>
    )
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'resumen', label: 'Resumen' },
    { key: 'conversaciones', label: `Conversaciones (${contact.conversations?.length ?? 0})` },
    { key: 'deals', label: `Deals (${contact.deals?.length ?? 0})` },
    { key: 'tickets', label: `Tickets (${contact.tickets?.length ?? 0})` },
    { key: 'notas', label: `Notas (${contact.contactNotes?.length ?? 0})` },
    { key: 'actividad', label: 'Actividad' },
    { key: 'tareas', label: 'Tareas' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="text-sm text-muted-foreground hover:text-foreground">← Volver</button>
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-lg font-bold uppercase">
          {contact.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h1 className="text-xl font-semibold truncate">{contact.name}</h1>
            <button onClick={openEditDialog} className="text-muted-foreground hover:text-foreground p-0.5 rounded" aria-label="Editar contacto">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-sm text-muted-foreground">{contact.phone?.split('@')[0] ?? contact.email ?? '—'}</p>
        </div>
        <Select value={contact.status} onValueChange={handleStatusChange}>
          <SelectTrigger
            className={`ml-2 h-6 text-xs font-medium px-2.5 rounded-full border-0 shadow-none w-auto min-w-0 gap-1 focus:ring-0 focus:ring-offset-0 ${STATUS_COLOR[contact.status] ?? 'bg-muted'}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="LEAD">Lead</SelectItem>
            <SelectItem value="PROSPECT">Prospecto</SelectItem>
            <SelectItem value="CUSTOMER">Cliente</SelectItem>
            <SelectItem value="VIP">VIP</SelectItem>
            <SelectItem value="CHURNED">Inactivo</SelectItem>
          </SelectContent>
        </Select>
        <Select value={contact.leadTemperature ?? ''} onValueChange={handleTemperatureChange}>
          <SelectTrigger className={`h-6 text-xs font-medium px-2.5 rounded-full border-0 shadow-none w-auto min-w-0 gap-1 focus:ring-0 focus:ring-offset-0 ${TEMP_COLOR[contact.leadTemperature ?? ''] ?? 'bg-muted/50 text-muted-foreground'}`}>
            <SelectValue placeholder="Temperatura" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Sin definir</SelectItem>
            <SelectItem value="COLD">Frío</SelectItem>
            <SelectItem value="WARM">Tibio</SelectItem>
            <SelectItem value="HOT">Caliente</SelectItem>
          </SelectContent>
        </Select>
        <Select value={contact.leadType ?? ''} onValueChange={handleContactTypeChange}>
          <SelectTrigger className={`h-6 text-xs font-medium px-2.5 rounded-full border-0 shadow-none w-auto min-w-0 gap-1 focus:ring-0 focus:ring-offset-0 ${LEAD_TYPE_COLOR[contact.leadType ?? ''] ?? 'bg-muted/50 text-muted-foreground'}`}>
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Sin definir</SelectItem>
            <SelectItem value="CURIOUS">Curioso</SelectItem>
            <SelectItem value="QUOTING">Cotizando</SelectItem>
            <SelectItem value="READY_TO_BUY">Listo para comprar</SelectItem>
            <SelectItem value="POST_SALE">Post-venta</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Single flat tab bar */}
      <div className="border-b flex gap-1 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
              tab === t.key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="pt-2">
        {tab === 'resumen' && (
          <div className="space-y-4">
            <CustomerValueCard value={value} loading={valueLoading} error={valueError} />
            <EcommercePerformanceCard revenue={revenue} loading={revenueLoading} error={revenueError} hasEmail={!!contact.email} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg border p-4 space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Métricas</h3>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">LTV</span><span className="font-semibold">${Number(contact.ltv).toFixed(2)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Health Score</span><span className="font-semibold">{contact.healthScore ?? '—'}/100</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Fuente</span><span>{contact.source}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Miembro desde</span><span>{new Date(contact.createdAt).toLocaleDateString('es-CL')}</span></div>
            </div>
            {contact.tags.length > 0 && (
              <div className="rounded-lg border p-4 space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Etiquetas</h3>
                <div className="flex flex-wrap gap-2">
                  {contact.tags.map(tag => (
                    <span key={tag.id} className="text-xs px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: tag.color }}>
                      {tag.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
            </div>
          </div>
        )}

        {tab === 'conversaciones' && (
          <div className="space-y-2">
            {(contact.conversations?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">Sin conversaciones</p>
            ) : contact.conversations!.map(conv => (
              <div key={conv.id} className="rounded-lg border p-3 flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium">{PLATFORM_LABEL[conv.channel.platform] ?? conv.channel.platform}</span>
                  <span className="text-muted-foreground ml-2">{conv.channel.name}</span>
                </div>
                <div className="text-right">
                  <div className="text-muted-foreground">{conv.messageCount} mensajes</div>
                  {conv.lastMessageAt && <div className="text-xs text-muted-foreground">{new Date(conv.lastMessageAt).toLocaleDateString('es-CL')}</div>}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'deals' && (
          <div className="space-y-2">
            {contact.deals.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin deals</p>
            ) : contact.deals.map(deal => (
              <div key={deal.id} className="rounded-lg border p-3 flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium">{deal.title}</span>
                  <span className="ml-2 text-xs px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: deal.stage.color }}>{deal.stage.name}</span>
                </div>
                <span className="font-semibold tabular-nums">{formatCLP(Number(deal.value))}</span>
              </div>
            ))}
          </div>
        )}

        {tab === 'tickets' && (
          <div className="space-y-2">
            {contact.tickets.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin tickets</p>
            ) : contact.tickets.map(ticket => (
              <div key={ticket.id} className="rounded-lg border p-3 flex items-center justify-between text-sm">
                <span className="font-medium">{ticket.title}</span>
                <div className="flex gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${TICKET_PRIORITY_COLOR[ticket.priority] ?? 'bg-muted'}`}>{ticket.priority}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted">{ticket.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'notas' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <textarea
                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background resize-none"
                rows={3}
                placeholder="Agregar una nota..."
                value={noteContent}
                onChange={e => setNoteContent(e.target.value)}
              />
              <button
                onClick={handleAddNote}
                disabled={!noteContent.trim() || savingNote}
                className="self-end px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
              >
                {savingNote ? '...' : 'Guardar'}
              </button>
            </div>
            <div className="space-y-2">
              {contact.contactNotes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin notas</p>
              ) : contact.contactNotes.map(note => (
                <div key={note.id} className="rounded-lg border p-3 text-sm">
                  <p>{note.content}</p>
                  <p className="text-xs text-muted-foreground mt-1">{new Date(note.createdAt).toLocaleDateString('es-CL', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'actividad' && (
          <ContactTimeline contactId={contact.id} />
        )}

        {tab === 'tareas' && (
          <ContactTasks contactId={contact.id} />
        )}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar contacto</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Nombre</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                placeholder="Nombre del contacto"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <input
                type="email"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
                value={editEmail}
                onChange={e => setEditEmail(e.target.value)}
                placeholder="email@ejemplo.com"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Teléfono</label>
              <input
                type="tel"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
                value={editPhone}
                onChange={e => setEditPhone(e.target.value)}
                placeholder="+56 9 1234 5678"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setEditOpen(false)}
              className="px-3 py-1.5 text-sm rounded-lg border hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              onClick={handleEditSave}
              disabled={savingEdit}
              className="px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
            >
              {savingEdit ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ── Performance e-commerce ─────────────────────────────────────────────────
   ROAS del workspace (30d) + pedidos del contacto cruzados por email. */
function EcommercePerformanceCard({
  revenue, loading, error, hasEmail
}: { revenue: RevenueSummary | null; loading: boolean; error: boolean; hasEmail: boolean }) {
  if (loading) {
    return (
      <div className="rounded-xl border p-5 animate-pulse space-y-3">
        <div className="h-3 w-40 bg-muted/50 rounded" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 bg-muted/40 rounded-lg" />)}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border p-5 text-sm text-muted-foreground">
        No se pudo cargar el rendimiento e-commerce.
      </div>
    )
  }

  if (!hasEmail) {
    return (
      <div className="rounded-xl border p-4 text-sm text-muted-foreground flex items-center gap-2">
        <ShoppingBag className="h-4 w-4 shrink-0" />
        Sin email — no se pueden cruzar pedidos de Shopify con este contacto.
      </div>
    )
  }

  if (!revenue) {
    return (
      <div className="rounded-xl border p-5 text-sm text-muted-foreground">
        Sin datos de ingresos disponibles.
      </div>
    )
  }

  const r = revenue
  const hasOrders = r.contactRevenue.orderCount > 0

  return (
    <div className="rounded-xl border bg-gradient-to-br from-violet-500/[0.05] to-transparent p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-600/90 dark:text-violet-400/90">
          Performance E-commerce
        </p>
        <TrendingUp className="h-4 w-4 text-violet-500" />
      </div>

      {/* Contact orders */}
      {hasOrders ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border bg-background/60 p-3">
            <p className="text-[11px] text-muted-foreground">Ingresos totales</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{formatCLP(r.contactRevenue.totalRevenue)}</p>
            <p className="text-[11px] text-muted-foreground">{r.contactRevenue.orderCount} pedido{r.contactRevenue.orderCount !== 1 ? 's' : ''}</p>
          </div>
          <div className="rounded-lg border bg-background/60 p-3">
            <p className="text-[11px] text-muted-foreground">Ticket promedio</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{formatCLP(r.contactRevenue.avgOrderValue)}</p>
          </div>
          {r.contactRevenue.lastPurchaseDate && (
            <div className="rounded-lg border bg-background/60 p-3">
              <p className="text-[11px] text-muted-foreground">Último pedido</p>
              <p className="mt-1 text-sm font-medium">{new Date(r.contactRevenue.lastPurchaseDate).toLocaleDateString('es-CL')}</p>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Sin pedidos registrados en Shopify para este email.</p>
      )}

      {/* Workspace ROAS context */}
      <div className="border-t pt-3 space-y-2">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Contexto workspace (últimos 30 días)</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border bg-background/60 p-3">
            <p className="text-[11px] text-muted-foreground">ROAS promedio</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {r.workspaceContext.avgROAS !== null ? `${r.workspaceContext.avgROAS}x` : '—'}
            </p>
          </div>
          <div className="rounded-lg border bg-background/60 p-3">
            <p className="text-[11px] text-muted-foreground">Inversión ads</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{formatCLP(r.workspaceContext.totalAdSpend30d)}</p>
          </div>
          <div className="rounded-lg border bg-background/60 p-3">
            <p className="text-[11px] text-muted-foreground">Ingresos</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{formatCLP(r.workspaceContext.totalRevenue30d)}</p>
          </div>
          <div className="rounded-lg border bg-background/60 p-3">
            <p className="text-[11px] text-muted-foreground">Ganancia neta</p>
            <p className={`mt-1 text-lg font-semibold tabular-nums ${r.workspaceContext.netProfit30d < 0 ? 'text-destructive' : 'text-emerald-600'}`}>
              {formatCLP(r.workspaceContext.netProfit30d)}
            </p>
          </div>
        </div>
        {r.contactAttribution.source && (
          <p className="text-[11px] text-muted-foreground">
            Fuente: <span className="font-medium">{r.contactAttribution.source}</span>
            {' · '}{r.contactAttribution.note}
          </p>
        )}
      </div>
    </div>
  )
}

/* ── Valor del cliente ──────────────────────────────────────────────────────
   Metria's differentiator: real, per-customer value a generic CRM can't show.
   Hero number = valor real capturado (ventas ganadas + pedidos pagados),
   con KPIs de apoyo. Estados de carga / error / vacío (ceros). */
function CustomerValueCard({
  value, loading, error
}: { value: ContactValue | null; loading: boolean; error: boolean }) {
  if (loading) {
    return (
      <div className="rounded-xl border bg-gradient-to-br from-emerald-500/[0.06] to-transparent p-5 animate-pulse">
        <div className="h-3 w-32 bg-muted/50 rounded mb-3" />
        <div className="h-9 w-40 bg-muted/50 rounded mb-5" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 bg-muted/40 rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border p-5 text-sm text-muted-foreground">
        No se pudo cargar el valor del cliente.
      </div>
    )
  }

  const v: ContactValue = value ?? {
    ltv: 0, wonDealsValue: 0, wonDealsCount: 0,
    openPipelineValue: 0, openDealsCount: 0, lostDealsCount: 0, capturedValue: 0
  }

  const kpis: { label: string; amount: number; meta?: string; icon: typeof Trophy; tint: string }[] = [
    { label: 'LTV', amount: v.ltv, icon: Wallet, tint: 'text-sky-500' },
    { label: 'Ventas ganadas', amount: v.wonDealsValue, meta: `${v.wonDealsCount} deal${v.wonDealsCount === 1 ? '' : 's'}`, icon: Trophy, tint: 'text-emerald-500' },
    { label: 'Pipeline abierto', amount: v.openPipelineValue, meta: `${v.openDealsCount} deal${v.openDealsCount === 1 ? '' : 's'}`, icon: GitBranch, tint: 'text-violet-500' },
  ]
  if (v.ordersCount !== undefined) {
    kpis.push({
      label: 'Pedidos pagados', amount: v.ordersTotal ?? 0,
      meta: `${v.ordersCount} pedido${v.ordersCount === 1 ? '' : 's'}`, icon: ShoppingBag, tint: 'text-amber-500'
    })
  } else {
    kpis.push({
      label: 'Deals perdidos', amount: v.openPipelineValue >= 0 ? v.lostDealsCount : 0,
      meta: 'sin monto', icon: GitBranch, tint: 'text-muted-foreground'
    })
  }

  return (
    <div className="rounded-xl border bg-gradient-to-br from-emerald-500/[0.07] via-emerald-500/[0.02] to-transparent p-5">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-600/90 dark:text-emerald-400/90">
            Valor del cliente
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums leading-none">
            {formatCLP(v.capturedValue)}
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Valor real capturado{v.ordersCount !== undefined ? ' · ventas + pedidos' : ' · ventas ganadas'}
          </p>
        </div>
        <div className="rounded-lg bg-emerald-500/10 p-2.5">
          <Trophy className="h-5 w-5 text-emerald-500" />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpis.map(kpi => {
          const Icon = kpi.icon
          return (
            <div key={kpi.label} className="rounded-lg border bg-background/60 p-3">
              <div className="flex items-center gap-1.5">
                <Icon className={`h-3.5 w-3.5 ${kpi.tint}`} />
                <span className="text-[11px] text-muted-foreground truncate">{kpi.label}</span>
              </div>
              <p className="mt-1.5 text-lg font-semibold tabular-nums leading-tight">
                {kpi.label === 'Deals perdidos' ? kpi.amount : formatCLP(kpi.amount)}
              </p>
              {kpi.meta && <p className="text-[11px] text-muted-foreground">{kpi.meta}</p>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
