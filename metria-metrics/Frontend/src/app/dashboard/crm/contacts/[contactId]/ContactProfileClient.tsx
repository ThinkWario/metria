'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { fetchAPI } from '@/lib/api'
import { LeadQualificationBadge } from '@/components/crm/LeadQualificationBadge'
import ContactTimeline from '@/components/crm/ContactTimeline'
import ContactTasks from '@/components/crm/ContactTasks'
import { Trophy, Wallet, ShoppingBag, GitBranch } from 'lucide-react'

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
  const router = useRouter()

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
        <div>
          <h1 className="text-xl font-semibold">{contact.name}</h1>
          <p className="text-sm text-muted-foreground">{contact.phone?.split('@')[0] ?? contact.email ?? '—'}</p>
        </div>
        <span className={`ml-2 text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[contact.status] ?? 'bg-muted'}`}>
          {STATUS_LABEL[contact.status] ?? contact.status}
        </span>
        <LeadQualificationBadge
          temperature={contact.leadTemperature}
          type={contact.leadType}
          score={contact.leadScore}
        />
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
