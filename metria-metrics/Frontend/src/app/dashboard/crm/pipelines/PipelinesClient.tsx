'use client'
import { useState, useEffect } from 'react'
import { fetchAPI } from '@/lib/api'

interface Stage {
  id: string; name: string; color: string; order: number; isWon: boolean; isLost: boolean
}
interface Pipeline {
  id: string; name: string; isDefault: boolean
  stages: Stage[]
  _count: { deals: number }
}
interface Deal {
  id: string; title: string; value: string; status: string
  contact: { id: string; name: string }
  stage: { id: string; name: string; color: string }
}

export default function PipelinesClient() {
  const [mounted, setMounted] = useState(false)
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null)
  const [deals, setDeals] = useState<Deal[]>([])
  const [loadingPipelines, setLoadingPipelines] = useState(true)
  const [loadingDeals, setLoadingDeals] = useState(false)
  const [movingDealId, setMovingDealId] = useState<string | null>(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    fetchAPI('/crm/pipelines')
      .then((data: Pipeline[]) => {
        setPipelines(data)
        if (data.length > 0) setSelectedPipelineId(data[0].id)
      })
      .catch(console.error)
      .finally(() => setLoadingPipelines(false))
  }, [mounted])

  useEffect(() => {
    if (!mounted || !selectedPipelineId) return
    setLoadingDeals(true)
    fetchAPI(`/crm/deals?pipelineId=${selectedPipelineId}`)
      .then(setDeals)
      .catch(console.error)
      .finally(() => setLoadingDeals(false))
  }, [mounted, selectedPipelineId])

  async function handleMove(dealId: string, stageId: string) {
    setMovingDealId(dealId)
    try {
      const updated = await fetchAPI(`/crm/deals/${dealId}/move`, {
        method: 'PATCH',
        body: JSON.stringify({ stageId })
      })
      setDeals(prev => prev.map(d => d.id === dealId ? { ...d, stage: updated.stage ?? d.stage, status: updated.status ?? d.status } : d))
    } catch (err) {
      console.error(err)
    } finally {
      setMovingDealId(null)
    }
  }

  if (!mounted || loadingPipelines) {
    return (
      <div className="flex gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="w-56 h-64 rounded-lg bg-muted/40 animate-pulse shrink-0" />
        ))}
      </div>
    )
  }

  if (pipelines.length === 0) {
    return <div className="text-center py-16 text-muted-foreground text-sm">Sin pipelines. Crea uno desde la API.</div>
  }

  const selectedPipeline = pipelines.find(p => p.id === selectedPipelineId)
  const stages = selectedPipeline?.stages ?? []

  return (
    <div className="space-y-4">
      {/* Pipeline selector */}
      <div className="flex items-center gap-3">
        <select
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
          value={selectedPipelineId ?? ''}
          onChange={e => setSelectedPipelineId(e.target.value)}
        >
          {pipelines.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        {loadingDeals && <span className="text-xs text-muted-foreground">Cargando...</span>}
      </div>

      {/* Kanban columns */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map(stage => {
          const stageDeals = deals.filter(d => d.stage.id === stage.id)
          return (
            <div key={stage.id} className="w-60 shrink-0 flex flex-col gap-2">
              {/* Column header */}
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                  <span className="text-sm font-medium">{stage.name}</span>
                </div>
                <span className="text-xs text-muted-foreground">{stageDeals.length}</span>
              </div>

              {/* Deal cards */}
              <div className="space-y-2">
                {stageDeals.map(deal => (
                  <div key={deal.id} className="rounded-lg border bg-card p-3 space-y-2 text-sm shadow-sm">
                    <div className="font-medium leading-tight">{deal.title}</div>
                    <div className="text-xs text-muted-foreground">{deal.contact.name}</div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs">${Number(deal.value).toFixed(2)}</span>
                      {deal.status === 'OPEN' && (
                        <select
                          className="text-xs border rounded px-1 py-0.5 bg-background focus:outline-none"
                          value={deal.stage.id}
                          disabled={movingDealId === deal.id}
                          onChange={e => handleMove(deal.id, e.target.value)}
                        >
                          {stages.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      )}
                      {deal.status !== 'OPEN' && (
                        <span className={`text-xs px-1.5 py-0.5 rounded ${deal.status === 'WON' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {deal.status === 'WON' ? 'Ganado' : 'Perdido'}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {stageDeals.length === 0 && (
                  <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Vacío</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
