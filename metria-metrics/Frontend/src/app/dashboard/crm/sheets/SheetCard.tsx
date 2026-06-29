"use client"

import { useState } from 'react'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RefreshCw, Trash2, ExternalLink, Power } from 'lucide-react'
import { toast } from 'sonner'
import { fetchAPI } from '@/lib/api'

export interface SheetIntegration {
  id: string
  sheetUrl: string
  sheetName: string
  campaignLabel?: string
  fieldMappings: Record<string, string>
  qualificationFields?: string[]
  importFilter: string
  targetPipelineId: string
  targetStageId: string
  isActive: boolean
  lastSyncedAt?: string
  lastSyncError?: string
  importedSessionIds: string[]
  pipeline: { name: string }
  stage: { name: string; color: string }
  createdAt: string
}

const FILTER_LABELS: Record<string, string> = {
  ALL: 'Todos los leads',
  CALIFICA_ONLY: 'Solo CALIFICA',
  EXCLUDE_NO_CALIFICA: 'Excluir NO_CALIFICA',
}

interface Props {
  integration: SheetIntegration
  onUpdated: () => void
}

export default function SheetCard({ integration, onUpdated }: Props) {
  const [syncing, setSyncing] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const syncNow = async () => {
    setSyncing(true)
    try {
      const res = await fetchAPI(`/sheets/${integration.id}/sync`, { method: 'POST' })
      toast.success(`Sync completo: ${res.data.imported} importados, ${res.data.skipped} saltados`)
      onUpdated()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSyncing(false)
    }
  }

  const toggleActive = async () => {
    setToggling(true)
    try {
      await fetchAPI(`/sheets/${integration.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !integration.isActive }),
      })
      toast.success(integration.isActive ? 'Integración pausada' : 'Integración activada')
      onUpdated()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setToggling(false)
    }
  }

  const deleteIntegration = async () => {
    if (!confirm(`¿Eliminar integración "${integration.sheetName}"? No se puede deshacer.`)) return
    setDeleting(true)
    try {
      await fetchAPI(`/sheets/${integration.id}`, { method: 'DELETE' })
      toast.success('Integración eliminada')
      onUpdated()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setDeleting(false)
    }
  }

  const lastSync = integration.lastSyncedAt
    ? new Date(integration.lastSyncedAt).toLocaleString('es-CL')
    : 'Nunca'

  return (
    <Card className="bg-card/30 backdrop-blur-xl border border-border/50 hover:border-primary/30 transition-all">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base truncate">{integration.sheetName}</CardTitle>
            {integration.campaignLabel && (
              <p className="text-xs text-muted-foreground mt-0.5">{integration.campaignLabel}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={integration.isActive ? 'default' : 'secondary'}>
              {integration.isActive ? 'Activa' : 'Pausada'}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pb-3 space-y-2 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: integration.stage.color }}
          />
          <span className="truncate">{integration.pipeline.name} → {integration.stage.name}</span>
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>Filtro: <span className="text-foreground">{FILTER_LABELS[integration.importFilter] ?? integration.importFilter}</span></span>
          <span>{integration.importedSessionIds.length} importados</span>
        </div>

        <div className="text-xs text-muted-foreground">
          Último sync: <span className="text-foreground">{lastSync}</span>
        </div>

        {integration.lastSyncError && (
          <p className="text-xs text-destructive truncate">{integration.lastSyncError}</p>
        )}
      </CardContent>

      <CardFooter className="pt-0 gap-2 flex-wrap">
        <Button size="sm" variant="outline" onClick={syncNow} disabled={syncing || !integration.isActive}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Sincronizando...' : 'Sync ahora'}
        </Button>

        <Button size="sm" variant="outline" onClick={toggleActive} disabled={toggling}>
          <Power className="h-3.5 w-3.5 mr-1.5" />
          {integration.isActive ? 'Pausar' : 'Activar'}
        </Button>

        <a href={integration.sheetUrl} target="_blank" rel="noopener noreferrer">
          <Button size="sm" variant="ghost">
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </a>

        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={deleteIntegration} disabled={deleting}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </CardFooter>
    </Card>
  )
}
