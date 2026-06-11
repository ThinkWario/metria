'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { fetchAPI } from '@/lib/api'

interface BotFlow {
  id: string
  name: string
  triggerType: string
  triggerValue: string | null
  channel: string
  isActive: boolean
  priority: number
  actions: unknown[]
}

const TRIGGER_LABELS: Record<string, string> = {
  FIRST_MESSAGE: 'Primer mensaje',
  KEYWORD: 'Palabra clave',
  BUSINESS_HRS: 'Fuera de horario',
}

const CHANNEL_LABELS: Record<string, string> = {
  ALL: 'Todos',
  WHATSAPP: 'WhatsApp',
  INSTAGRAM: 'Instagram',
  TELEGRAM: 'Telegram',
}

interface BotDetailClientProps {
  botId: string
}

export default function BotDetailClient({ botId }: BotDetailClientProps) {
  const [mounted, setMounted] = useState(false)
  const [flows, setFlows] = useState<BotFlow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formName, setFormName] = useState('')
  const [formTriggerType, setFormTriggerType] = useState('FIRST_MESSAGE')
  const [formChannel, setFormChannel] = useState('ALL')
  const [formTriggerValue, setFormTriggerValue] = useState('')
  const [formMessageContent, setFormMessageContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const router = useRouter()

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    loadFlows()
  }, [mounted])

  const loadFlows = async () => {
    setLoading(true)
    try {
      const data = await fetchAPI(`/bots/agents/${botId}/flows`)
      setFlows(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Error loading flows:', error)
      setFlows([])
    } finally {
      setLoading(false)
    }
  }

  const handleCreateFlow = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formName.trim()) return

    setSubmitting(true)
    try {
      const actions = formMessageContent.trim()
        ? [{ type: 'send_message', content: formMessageContent }]
        : []

      const newFlow = await fetchAPI(`/bots/agents/${botId}/flows`, {
        method: 'POST',
        body: JSON.stringify({
          name: formName,
          triggerType: formTriggerType,
          triggerValue: formTriggerType === 'KEYWORD' ? formTriggerValue : null,
          channel: formChannel,
          actions,
        })
      })
      setFlows([...flows, newFlow])
      setFormName('')
      setFormTriggerType('FIRST_MESSAGE')
      setFormChannel('ALL')
      setFormTriggerValue('')
      setFormMessageContent('')
      setShowForm(false)
    } catch (error) {
      console.error('Error creating flow:', error)
    } finally {
      setSubmitting(false)
    }
  }

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      const updated = await fetchAPI(`/bots/flows/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !currentActive })
      })
      setFlows(flows.map(f => f.id === id ? updated : f))
    } catch (error) {
      console.error('Error toggling flow status:', error)
    }
  }

  const handleDeleteFlow = async (id: string) => {
    try {
      await fetchAPI(`/bots/flows/${id}`, { method: 'DELETE' })
      setFlows(flows.filter(f => f.id !== id))
    } catch (error) {
      console.error('Error deleting flow:', error)
    }
  }

  if (!mounted) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 rounded-lg bg-muted/40 animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        ← Volver
      </button>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Flujos del Bot</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push(`/dashboard/bots/${botId}/setup`)}
            className="px-4 py-2 border rounded-lg text-sm font-medium hover:bg-muted/30 transition-colors"
          >
            Programa tu agente
          </button>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Nuevo Flujo
            </button>
          )}
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleCreateFlow} className="border rounded-lg p-4 space-y-3 bg-muted/20">
          <div>
            <label className="block text-sm font-medium mb-1">Nombre</label>
            <input
              type="text"
              value={formName}
              onChange={e => setFormName(e.target.value)}
              placeholder="Ej: Respuesta a precio"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Tipo de disparador</label>
              <select
                value={formTriggerType}
                onChange={e => setFormTriggerType(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
              >
                <option value="FIRST_MESSAGE">Primer mensaje</option>
                <option value="KEYWORD">Palabra clave</option>
                <option value="BUSINESS_HRS">Fuera de horario</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Canal</label>
              <select
                value={formChannel}
                onChange={e => setFormChannel(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
              >
                <option value="ALL">Todos</option>
                <option value="WHATSAPP">WhatsApp</option>
                <option value="INSTAGRAM">Instagram</option>
                <option value="TELEGRAM">Telegram</option>
              </select>
            </div>
          </div>

          {formTriggerType === 'KEYWORD' && (
            <div>
              <label className="block text-sm font-medium mb-1">Palabra clave</label>
              <input
                type="text"
                value={formTriggerValue}
                onChange={e => setFormTriggerValue(e.target.value)}
                placeholder="Palabra clave (ej: precio, hola)"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Mensaje de respuesta (opcional)</label>
            <textarea
              value={formMessageContent}
              onChange={e => setFormMessageContent(e.target.value)}
              placeholder="Mensaje de respuesta (opcional). Usa {nombre} para el nombre del contacto."
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background resize-none"
              rows={3}
            />
          </div>

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => {
                setShowForm(false)
                setFormName('')
                setFormTriggerType('FIRST_MESSAGE')
                setFormChannel('ALL')
                setFormTriggerValue('')
                setFormMessageContent('')
              }}
              className="px-3 py-2 text-sm border rounded-lg hover:bg-muted/30 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || !formName.trim()}
              className="px-3 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Creando...' : 'Crear'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : flows.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Sin flujos. Crea el primero.</div>
      ) : (
        <div className="space-y-2">
          {flows.map(flow => (
            <div
              key={flow.id}
              className="border rounded-lg p-4 flex items-center justify-between hover:bg-muted/20 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-sm">{flow.name}</h3>
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                  <span>{TRIGGER_LABELS[flow.triggerType] || flow.triggerType}</span>
                  {flow.triggerValue && <span className="text-xs italic">"{flow.triggerValue}"</span>}
                  <span>•</span>
                  <span>{CHANNEL_LABELS[flow.channel] || flow.channel}</span>
                  <span>•</span>
                  <span>Prioridad: {flow.priority}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 ml-4">
                <button
                  onClick={() => handleToggleActive(flow.id, flow.isActive)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    flow.isActive
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {flow.isActive ? 'Activo' : 'Inactivo'}
                </button>
                <button
                  onClick={() => handleDeleteFlow(flow.id)}
                  className="px-3 py-1 rounded-lg text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
