"use client"

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, ChevronRight, ChevronLeft, AlertCircle, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { fetchAPI } from '@/lib/api'

interface AnalyzeResult {
  sheetId: string
  sheetName: string
  headers: string[]
  suggestedMappings: {
    mappings: {
      name?: string
      email?: string
      phone?: string
      sessionId?: string
      eventColumn?: string
      eventFilter?: string
    }
    suggestedQualificationFields: string[]
    notes: string[]
  }
}

interface Pipeline {
  id: string
  name: string
  isDefault?: boolean
  stages: { id: string; name: string; color: string; order: number }[]
}

const CRM_MAPPING_FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: 'name', label: 'Nombre', required: true },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Teléfono' },
  { key: 'sessionId', label: 'ID de sesión (dedup)' },
  { key: 'eventColumn', label: 'Columna de estado/evento' },
]

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

export default function SheetLinkModal({ open, onClose, onCreated }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [url, setUrl] = useState('')
  const [campaignLabel, setCampaignLabel] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResult | null>(null)
  const [mappings, setMappings] = useState<Record<string, string>>({})
  const [eventFilter, setEventFilter] = useState('')
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [pipelineId, setPipelineId] = useState('')
  const [stageId, setStageId] = useState('')
  const [qualFields, setQualFields] = useState<string[]>([])
  const [qualRules, setQualRules] = useState('')
  const [importFilter, setImportFilter] = useState('ALL')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    fetchAPI('/crm/pipelines')
      .then((res: any) => {
        const list: Pipeline[] = res.data ?? res
        setPipelines(list)
        const def = list.find((p: Pipeline) => p.isDefault) ?? list[0]
        if (def) {
          setPipelineId(def.id)
          const firstStage = def.stages?.sort((a: any, b: any) => a.order - b.order)[0]
          if (firstStage) setStageId(firstStage.id)
        }
      })
      .catch(() => {})
  }, [open])

  const reset = () => {
    setStep(1); setUrl(''); setCampaignLabel(''); setAnalyzing(false)
    setAnalyzeResult(null); setMappings({}); setEventFilter('')
    setPipelineId(''); setStageId(''); setQualFields([]); setQualRules('')
    setImportFilter('ALL'); setSaving(false)
  }

  const handleClose = () => { reset(); onClose() }

  const analyze = async () => {
    if (!url.trim()) { toast.error('Ingresa una URL de Google Sheets'); return }
    setAnalyzing(true)
    try {
      const res = await fetchAPI('/sheets/analyze', {
        method: 'POST',
        body: JSON.stringify({ url: url.trim() }),
      })
      const result: AnalyzeResult = res.data
      setAnalyzeResult(result)
      setMappings(
        Object.fromEntries(
          Object.entries(result.suggestedMappings.mappings).filter(([k, v]) => v && k !== 'eventFilter') as [string, string][]
        )
      )
      setEventFilter(result.suggestedMappings.mappings.eventFilter ?? '')
      setQualFields(result.suggestedMappings.suggestedQualificationFields ?? [])
      setStep(2)
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setAnalyzing(false)
    }
  }

  const save = async () => {
    if (!pipelineId || !stageId) { toast.error('Selecciona pipeline y etapa'); return }
    setSaving(true)
    try {
      await fetchAPI('/sheets', {
        method: 'POST',
        body: JSON.stringify({
          sheetUrl: url,
          sheetId: analyzeResult!.sheetId,
          sheetName: analyzeResult!.sheetName,
          campaignLabel: campaignLabel || null,
          fieldMappings: { ...mappings, eventFilter: eventFilter || undefined },
          qualificationFields: qualFields.length > 0 ? qualFields : null,
          qualificationRules: qualRules || null,
          importFilter,
          targetPipelineId: pipelineId,
          targetStageId: stageId,
        }),
      })
      toast.success('Planilla vinculada correctamente')
      onCreated()
      handleClose()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const selectedPipeline = pipelines.find(p => p.id === pipelineId)
  const stages = selectedPipeline?.stages?.sort((a, b) => a.order - b.order) ?? []

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Vincular Google Sheets
            <Badge variant="outline" className="ml-auto text-xs font-normal">Paso {step} de 3</Badge>
          </DialogTitle>
        </DialogHeader>

        {/* PASO 1: URL */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>URL de la planilla</Label>
              <Input
                placeholder="https://docs.google.com/spreadsheets/d/..."
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && analyze()}
              />
              <p className="text-xs text-muted-foreground">
                La planilla debe ser pública o compartida con acceso de lectura
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Etiqueta de campaña <span className="text-muted-foreground">(opcional)</span></Label>
              <Input
                placeholder="Ej: Meta Ads Solar Mayo"
                value={campaignLabel}
                onChange={e => setCampaignLabel(e.target.value)}
              />
            </div>
            <Button className="w-full" onClick={analyze} disabled={analyzing}>
              {analyzing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analizando planilla...</> : 'Analizar con IA →'}
            </Button>
          </div>
        )}

        {/* PASO 2: MAPEO + PIPELINE */}
        {step === 2 && analyzeResult && (
          <div className="space-y-4">
            {analyzeResult.suggestedMappings.notes.length > 0 && (
              <div className="flex gap-2 p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <ul className="space-y-1">
                  {analyzeResult.suggestedMappings.notes.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              </div>
            )}

            <div>
              <p className="text-sm font-medium mb-2">Mapeo de campos al CRM</p>
              <div className="space-y-2">
                {CRM_MAPPING_FIELDS.map(({ key, label, required }) => (
                  <div key={key} className="flex items-center gap-2">
                    <Label className="w-40 text-xs shrink-0">
                      {label}{required && <span className="text-destructive ml-0.5">*</span>}
                    </Label>
                    <Select
                      value={mappings[key] ?? '__none__'}
                      onValueChange={v => setMappings(prev => ({ ...prev, [key]: v === '__none__' ? '' : v }))}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="— Sin mapear —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Sin mapear —</SelectItem>
                        {analyzeResult.headers.map(h => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
                {mappings.eventColumn && (
                  <div className="flex items-center gap-2">
                    <Label className="w-40 text-xs shrink-0">Valor a importar</Label>
                    <Input
                      className="h-8 text-xs"
                      placeholder='Ej: "complete"'
                      value={eventFilter}
                      onChange={e => setEventFilter(e.target.value)}
                    />
                  </div>
                )}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Pipeline de destino</p>
              <div className="grid grid-cols-2 gap-2">
                <Select value={pipelineId} onValueChange={id => { setPipelineId(id); setStageId('') }}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Pipeline" /></SelectTrigger>
                  <SelectContent>
                    {pipelines.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={stageId} onValueChange={setStageId} disabled={!pipelineId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Etapa inicial" /></SelectTrigger>
                  <SelectContent>
                    {stages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setStep(1)}><ChevronLeft className="h-4 w-4 mr-1" />Atrás</Button>
              <Button size="sm" className="flex-1" onClick={() => setStep(3)} disabled={!pipelineId || !stageId}>
                Configurar pre-calificación <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* PASO 3: CALIFICACIÓN */}
        {step === 3 && analyzeResult && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-1">Campos para pre-calificación</p>
              <p className="text-xs text-muted-foreground mb-3">
                El agente usará estos campos para evaluar cada lead antes de ingresarlo al CRM
              </p>
              <div className="grid grid-cols-1 gap-1 max-h-48 overflow-y-auto pr-1">
                {analyzeResult.headers.map(h => (
                  <label key={h} className="flex items-center justify-between gap-2 cursor-pointer hover:bg-muted/40 rounded px-2 py-1.5">
                    <span className="text-xs truncate">{h}</span>
                    <Switch
                      checked={qualFields.includes(h)}
                      onCheckedChange={checked => setQualFields(prev =>
                        checked ? [...prev, h] : prev.filter(f => f !== h)
                      )}
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Reglas de calificación <span className="text-muted-foreground">(opcional)</span></Label>
              <Textarea
                className="text-xs resize-none"
                rows={4}
                placeholder="Ej: El lead califica si es dueño de la propiedad, no tiene embargo vigente e ingreso mensual > $800.000"
                value={qualRules}
                onChange={e => setQualRules(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Filtro de importación</Label>
              <Select value={importFilter} onValueChange={setImportFilter}>
                <SelectTrigger className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos los leads (sin filtro)</SelectItem>
                  <SelectItem value="CALIFICA_ONLY">Solo leads que CALIFICAN</SelectItem>
                  <SelectItem value="EXCLUDE_NO_CALIFICA">Excluir leads que NO CALIFICAN</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Puedes cambiar esto después desde la tarjeta de integración
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setStep(2)}><ChevronLeft className="h-4 w-4 mr-1" />Atrás</Button>
              <Button size="sm" className="flex-1" onClick={save} disabled={saving}>
                {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Guardando...</> : 'Vincular planilla ✓'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
