'use client'

import { useState, useEffect, useMemo } from 'react'
import { fetchAPI } from '@/lib/api'
import { formatCLP } from '@/lib/formatCurrency'
import { sortDeals, type SortColumn, type SortDirection } from '@/lib/dealSort'
import { CreateDealModal, type Deal, type Stage } from '@/components/crm/CreateDealModal'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, ChevronUp, ChevronDown } from 'lucide-react'

interface Pipeline { id: string; name: string; isDefault: boolean; stages: Stage[]; _count: { deals: number } }

const COLUMNS: { key: SortColumn; label: string }[] = [
  { key: 'title', label: 'Título' },
  { key: 'contact', label: 'Contacto' },
  { key: 'value', label: 'Valor' },
  { key: 'stage', label: 'Etapa' },
  { key: 'probability', label: 'Probabilidad' },
  { key: 'expectedCloseAt', label: 'Cierre est.' },
]

export default function DealsListClient() {
  const [mounted, setMounted] = useState(false)
  const [deals, setDeals] = useState<Deal[]>([])
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [loading, setLoading] = useState(true)
  const [sortColumn, setSortColumn] = useState<SortColumn>('title')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [editDeal, setEditDeal] = useState<Deal | null>(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    Promise.all([fetchAPI('/crm/pipelines'), fetchAPI('/crm/deals')])
      .then(([pipelinesData, dealsData]) => {
        setPipelines(Array.isArray(pipelinesData) ? pipelinesData : [])
        setDeals(Array.isArray(dealsData) ? dealsData : [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [mounted])

  const sorted = useMemo(() => sortDeals(deals, sortColumn, sortDirection), [deals, sortColumn, sortDirection])
  const defaultPipeline = pipelines[0]

  function handleSort(column: SortColumn) {
    if (column === sortColumn) {
      setSortDirection(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  function handleCreated(deal: Deal) {
    setDeals(prev => [deal, ...prev])
  }

  function handleUpdated(deal: Deal) {
    setDeals(prev => prev.map(d => (d.id === deal.id ? deal : d)))
  }

  if (!mounted || loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{deals.length} deal{deals.length === 1 ? '' : 's'} en total</p>
        <Button onClick={() => setCreateModalOpen(true)} disabled={!defaultPipeline}>
          <Plus className="h-4 w-4 mr-1" /> Nuevo Deal
        </Button>
      </div>

      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  role="columnheader"
                  className="text-left px-3 py-2 font-semibold cursor-pointer select-none whitespace-nowrap"
                  onClick={() => handleSort(col.key)}
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    {sortColumn === col.key && (sortDirection === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(deal => (
              <tr
                key={deal.id}
                className="border-b last:border-0 hover:bg-muted/20 cursor-pointer"
                onClick={() => setEditDeal(deal)}
              >
                <td className="px-3 py-2">{deal.title}</td>
                <td className="px-3 py-2">{deal.contact.name}</td>
                <td className="px-3 py-2 tabular-nums">{formatCLP(deal.value)}</td>
                <td className="px-3 py-2">
                  <span className="text-xs px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: deal.stage.color }}>
                    {deal.stage.name}
                  </span>
                </td>
                <td className="px-3 py-2 tabular-nums">{deal.probability ?? '-'}%</td>
                <td className="px-3 py-2">{deal.expectedCloseAt ? deal.expectedCloseAt.substring(0, 10) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">Sin deals todavía</p>
        )}
      </div>

      {defaultPipeline && (
        <CreateDealModal
          open={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          stages={defaultPipeline.stages}
          defaultStageId={defaultPipeline.stages[0]?.id ?? ''}
          pipelineId={defaultPipeline.id}
          onCreated={handleCreated}
        />
      )}

      <CreateDealModal
        open={editDeal != null}
        onClose={() => setEditDeal(null)}
        stages={defaultPipeline?.stages ?? []}
        defaultStageId=""
        pipelineId={defaultPipeline?.id ?? ''}
        editDeal={editDeal}
        onCreated={() => {}}
        onUpdated={handleUpdated}
      />
    </div>
  )
}
