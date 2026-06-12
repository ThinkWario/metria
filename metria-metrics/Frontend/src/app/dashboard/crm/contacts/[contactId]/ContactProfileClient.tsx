'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { fetchAPI } from '@/lib/api'
import { LeadQualificationBadge } from '@/components/crm/LeadQualificationBadge'

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

type Tab = 'resumen' | 'conversaciones' | 'deals' | 'tickets' | 'notas'

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
  const router = useRouter()

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    fetchAPI(`/crm/contacts/${contactId}`)
      .then(setContact)
      .catch(console.error)
      .finally(() => setLoading(false))
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
    { key: 'conversaciones', label: `Conversaciones (${contact.conversations.length})` },
    { key: 'deals', label: `Deals (${contact.deals.length})` },
    { key: 'tickets', label: `Tickets (${contact.tickets.length})` },
    { key: 'notas', label: `Notas (${contact.contactNotes.length})` }
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
          <p className="text-sm text-muted-foreground">{contact.phone ?? contact.email ?? '—'}</p>
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

      {/* Tabs */}
      <div className="border-b flex gap-1">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'resumen' && (
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
      )}

      {tab === 'conversaciones' && (
        <div className="space-y-2">
          {contact.conversations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin conversaciones</p>
          ) : contact.conversations.map(conv => (
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
              <span className="font-mono">${Number(deal.value).toFixed(2)}</span>
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
    </div>
  )
}
