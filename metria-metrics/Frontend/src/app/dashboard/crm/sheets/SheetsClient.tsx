"use client"

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Sheet } from 'lucide-react'
import { fetchAPI } from '@/lib/api'
import { toast } from 'sonner'
import SheetCard, { type SheetIntegration } from './SheetCard'
import SheetLinkModal from './SheetLinkModal'

export default function SheetsClient() {
  const [mounted, setMounted] = useState(false)
  const [integrations, setIntegrations] = useState<SheetIntegration[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetchAPI('/sheets')
      setIntegrations(res.data ?? [])
    } catch (err: any) {
      toast.error('Error cargando integraciones: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (mounted) load() }, [mounted])

  if (!mounted) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {integrations.length === 0 ? 'Sin planillas vinculadas' : `${integrations.length} planilla${integrations.length !== 1 ? 's' : ''} vinculada${integrations.length !== 1 ? 's' : ''}`}
        </p>
        <Button size="sm" onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          Vincular planilla
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      ) : integrations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border rounded-xl">
          <Sheet className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">Sin planillas vinculadas</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs">
            Vincula una planilla de Google Sheets para importar leads de campañas automáticamente
          </p>
          <Button size="sm" className="mt-4" onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Vincular primera planilla
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {integrations.map(i => (
            <SheetCard key={i.id} integration={i} onUpdated={load} />
          ))}
        </div>
      )}

      <SheetLinkModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={load}
      />
    </div>
  )
}
