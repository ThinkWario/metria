"use client"

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, ChevronRight, ChevronLeft, AlertCircle, Sparkles, MessageCircle, TriangleAlert } from 'lucide-react'
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
  const [pipelinesChecked, setPipelinesChecked] = useState(false)
  const [pipelineId, setPipelineId] = useState('')
  const [stageId, setStageId] = useState('')
  const [qualFields, setQualFields] = useState<string[]>([])
  const [customFieldDefs, setCustomFieldDefs] = useState<{ id: string; key: string; label: string }[]>([])
  const [includedColumns, setIncludedColumns] = useState<Record<string, boolean>>({})
  const [columnCustomFieldMap, setColumnCustomFieldMap] = useState<Record<string, string>>({})
  const [permissionError, setPermissionError] = useState(false)
  const [stageRouting, setStageRouting] = useState<Record<string, string>>({})
  const [qualRules, setQualRules] = useState('')
  const [importFilter, setImportFilter] = useState('ALL')
  const [linkToWhatsapp, setLinkToWhatsapp] = useState(false)
  const [whatsappOpeningMessage, setWhatsappOpeningMessage] = useState('')
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
      .finally(() => setPipelinesChecked(true))
    fetchAPI('/crm/custom-fields').then(setCustomFieldDefs).catch(() => {})
  }, [open])

  const noPipelines = pipelinesChecked && pipelines.length === 0

  const reset = () => {
    setStep(1); setUrl(''); setCampaignLabel(''); setAnalyzing(false)
    setAnalyzeResult(null); setMappings({}); setEventFilter('')
    setPipelines([]); setPipelinesChecked(false)
    setCustomFieldDefs([]); setIncludedColumns({}); setColumnCustomFieldMap({}); setPermissionError(false)
    setStageRouting({})
    setPipelineId(''); setStageId(''); setQualFields([]); setQualRules('')
    setImportFilter('ALL'); setLinkToWhatsapp(false); setWhatsappOpeningMessage(''); setSaving(false)
  }

  const handleClose = () => { reset(); onClose() }

  const analyze = async () => {
    if (!url.trim()) { toast.error('Ingresa una URL de Google Sheets'); return }
    setAnalyzing(true)
    setPermissionError(false)
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
      setIncludedColumns(Object.fromEntries(result.headers.map(h => [h, true])))
      setStep(2)
    } catch (err: any) {
      if (err.message === 'SHEET_PERMISSION_DENIED') {
        setPermissionError(true)
      } else {
        toast.error(err.message)
      }
    } finally {
      setAnalyzing(false)
    }
  }

  const save = async () => {
    if (!pipelineId || !stageId) { toast.error('Selecciona pipeline y etapa'); return }
    setSaving(true)
    try {
      const excludedColumns = Object.entries(includedColumns).filter(([, included]) => !included).map(([h]) => h)
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
          linkToWhatsapp,
          whatsappOpeningMessage: whatsappOpeningMessage.trim() || null,
          excludedColumns,
          customFieldMappings: columnCustomFieldMap,
          stageRouting,
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
            {noPipelines && (
              <div className="flex gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-700 dark:text-amber-400">
                <TriangleAlert className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Todavía no tienes ningún Pipeline creado. Necesitas al menos uno para poder
                  asignarle los leads importados desde la planilla.{' '}
                  <Link href="/dashboard/crm/pipelines" className="underline font-medium">
                    Crear un Pipeline primero →
                  </Link>
                </span>
              </div>
            )}
            {permissionError && (
              <div className="flex gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-xs text-destructive">
                <TriangleAlert className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Metria no tiene permiso para leer esta planilla. Abrí el Sheet → botón{' '}
                  <strong>Compartir</strong> → cambiá el acceso general a{' '}
                  <strong>&quot;Cualquiera con el enlace&quot; → Lector</strong> → volvé a intentar.
                </span>
              </div>
            )}
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
            <Button className="w-full" onClick={analyze} disabled={analyzing || noPipelines}>
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
              <div className="grid grid-cols-1 gap-1 max-h-64 overflow-y-auto pr-1">
                {analyzeResult.headers.map(h => (
                  <div key={h} className="flex items-center justify-between gap-2 rounded px-2 py-1.5 hover:bg-muted/40">
                    <span className="text-xs truncate flex-1">{h}</span>
                    <Switch
                      aria-label={`Incluir ${h}`}
                      checked={includedColumns[h] ?? true}
                      onCheckedChange={checked => setIncludedColumns(prev => ({ ...prev, [h]: checked }))}
                    />
                    <Select
                      value={columnCustomFieldMap[h] ?? '__none__'}
                      onValueChange={v => setColumnCustomFieldMap(prev => {
                        const next = { ...prev }
                        if (v === '__none__') delete next[h]; else next[h] = v
                        return next
                      })}
                    >
                      <SelectTrigger aria-label={`Campo personalizado para ${h}`} className="h-7 w-40 text-xs">
                        <SelectValue placeholder="— Sin mapear —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Sin mapear —</SelectItem>
                        {customFieldDefs.map(def => <SelectItem key={def.key} value={def.key}>{def.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Switch
                      checked={qualFields.includes(h)}
                      onCheckedChange={checked => setQualFields(prev =>
                        checked ? [...prev, h] : prev.filter(f => f !== h)
                      )}
                    />
                  </div>
                ))}
              </div>
            </div>

            {qualFields.length > 0 && (
              <div className="space-y-2 rounded-lg border p-3">
                <p className="text-sm font-medium">Ruteo automático por calificación</p>
                <p className="text-xs text-muted-foreground">
                  Opcional — si no eliges una etapa para un resultado, ese lead entra a la etapa
                  inicial configurada más abajo, como hoy.
                </p>
                {([
                  { status: 'CALIFICA', label: 'Etapa si CALIFICA' },
                  { status: 'REVISAR', label: 'Etapa si REVISAR' },
                  { status: 'NO_CALIFICA', label: 'Etapa si NO CALIFICA' },
                ] as const).map(({ status, label }) => (
                  <div key={status} className="flex items-center gap-2">
                    <Label className="w-32 text-xs shrink-0">{label}</Label>
                    <Select
                      value={stageRouting[status] ?? '__none__'}
                      onValueChange={v => setStageRouting(prev => {
                        const next = { ...prev }
                        if (v === '__none__') delete next[status]; else next[status] = v
                        return next
                      })}
                    >
                      <SelectTrigger aria-label={label} className="h-8 text-xs"><SelectValue placeholder="— Usar etapa inicial —" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Usar etapa inicial —</SelectItem>
                        {stages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}

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

            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm flex items-center gap-1.5">
                  <MessageCircle className="h-4 w-4" />
                  Vincular con WhatsApp
                </Label>
                <Switch checked={linkToWhatsapp} onCheckedChange={setLinkToWhatsapp} />
              </div>

              {linkToWhatsapp && (
                <div className="space-y-2 pt-1">
                  <div className="flex gap-2 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-md text-xs text-amber-700 dark:text-amber-400">
                    <TriangleAlert className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      Esto NO envía mensajes automáticamente. Solo prepara la conversación con un
                      primer mensaje sugerido para que lo revises y envíes tú manualmente desde el
                      inbox. Enviar mensajes masivos no solicitados por WhatsApp puede hacer que Meta
                      bloquee el número — por eso el envío siempre requiere tu confirmación manual.
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      Mensaje sugerido <span>(opcional, usa {'{nombre}'} para el nombre del lead)</span>
                    </Label>
                    <Textarea
                      className="text-xs resize-none"
                      rows={3}
                      placeholder="Hola {nombre}, vimos tu interés y nos encantaría ayudarte 🙌"
                      value={whatsappOpeningMessage}
                      onChange={e => setWhatsappOpeningMessage(e.target.value)}
                    />
                  </div>
                </div>
              )}
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
