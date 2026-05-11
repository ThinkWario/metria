'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { fetchAPI } from '@/lib/api'

interface BotAgent {
  id: string
  name: string
  description: string | null
  isActive: boolean
  _count: {
    flows: number
  }
}

export default function BotListClient() {
  const [mounted, setMounted] = useState(false)
  const [bots, setBots] = useState<BotAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const router = useRouter()

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    loadBots()
  }, [mounted])

  const loadBots = async () => {
    setLoading(true)
    try {
      const data = await fetchAPI('/bots/agents')
      setBots(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('Error loading bots:', error)
      setBots([])
    } finally {
      setLoading(false)
    }
  }

  const handleCreateBot = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formName.trim()) return

    setSubmitting(true)
    try {
      const newBot = await fetchAPI('/bots/agents', {
        method: 'POST',
        body: JSON.stringify({
          name: formName,
          description: formDescription || null
        })
      })
      setBots([...bots, newBot])
      setFormName('')
      setFormDescription('')
      setShowForm(false)
    } catch (error) {
      console.error('Error creating bot:', error)
    } finally {
      setSubmitting(false)
    }
  }

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      const updated = await fetchAPI(`/bots/agents/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !currentActive })
      })
      setBots(bots.map(b => b.id === id ? updated : b))
    } catch (error) {
      console.error('Error toggling bot status:', error)
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
      <div className="flex justify-end">
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Nuevo Bot
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleCreateBot} className="border rounded-lg p-4 space-y-3 bg-muted/20">
          <div>
            <label className="block text-sm font-medium mb-1">Nombre</label>
            <input
              type="text"
              value={formName}
              onChange={e => setFormName(e.target.value)}
              placeholder="Ej: Respuesta automática"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Descripción (opcional)</label>
            <textarea
              value={formDescription}
              onChange={e => setFormDescription(e.target.value)}
              placeholder="Describe qué hace este bot..."
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background resize-none"
              rows={2}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => {
                setShowForm(false)
                setFormName('')
                setFormDescription('')
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
      ) : bots.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Sin bots. Crea el primero.</div>
      ) : (
        <div className="space-y-2">
          {bots.map(bot => (
            <div
              key={bot.id}
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/dashboard/bots/${bot.id}`)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  router.push(`/dashboard/bots/${bot.id}`)
                }
              }}
              className="border rounded-lg p-4 hover:bg-muted/30 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset flex items-center justify-between"
            >
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-sm">{bot.name}</h3>
                {bot.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{bot.description}</p>
                )}
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                  <span>{bot._count.flows} flujo{bot._count.flows !== 1 ? 's' : ''}</span>
                </div>
              </div>
              <button
                onClick={e => {
                  e.stopPropagation()
                  handleToggleActive(bot.id, bot.isActive)
                }}
                className={`ml-4 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  bot.isActive
                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {bot.isActive ? 'Activo' : 'Inactivo'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
