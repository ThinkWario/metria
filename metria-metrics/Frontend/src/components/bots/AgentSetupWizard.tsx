'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { fetchAPI } from '@/lib/api'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ---------- Types (mirror backend AgentProfile) ----------

interface OfferItem {
  name: string
  price: string
}

interface QualificationQuestion {
  key: string
  question: string
}

interface ObjectionItem {
  objection: string
  response: string
}

interface AgentProfile {
  business: { description: string; coverage: string }
  offer: OfferItem[]
  qualificationQuestions: QualificationQuestion[]
  objections: ObjectionItem[]
  scheduling: { enabled: boolean; types: string[] }
}

interface AvailabilityRule {
  id: string
  dayOfWeek: number
  startTime: string
  endTime: string
  apptType: string
}

interface DraftRule {
  dayOfWeek: number
  startTime: string
  endTime: string
  apptType: string
}

interface KnowledgeDoc {
  id: string
  name: string
  sourceType: string
  status: string
  error?: string | null
  botAgentId?: string | null
}

interface BotAgentDTO {
  id: string
  name: string
  tone?: string
  config?: Record<string, unknown> | null
}

const STEPS = [
  'Negocio',
  'Oferta',
  'Calificación',
  'Objeciones',
  'Agendamiento',
  'Persona',
  'Documentos',
]

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

const APPT_TYPE_LABELS: Record<string, string> = {
  SITE_VISIT: 'Visita técnica',
  CALL: 'Llamada',
}

const DOC_STATUS_STYLES: Record<string, string> = {
  PROCESSING: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
  READY: 'bg-green-500/15 text-green-600 border-green-500/30',
  ERROR: 'bg-red-500/15 text-red-500 border-red-500/30',
}

const DOC_STATUS_LABELS: Record<string, string> = {
  PROCESSING: 'Procesando',
  READY: 'Listo',
  ERROR: 'Error',
}

function emptyProfile(): AgentProfile {
  return {
    business: { description: '', coverage: '' },
    offer: [],
    qualificationQuestions: [],
    objections: [],
    scheduling: { enabled: false, types: [] },
  }
}

function normalizeProfile(raw: unknown): AgentProfile {
  const base = emptyProfile()
  if (!raw || typeof raw !== 'object') return base
  const p = raw as Partial<AgentProfile>
  return {
    business: {
      description: p.business?.description ?? '',
      coverage: p.business?.coverage ?? '',
    },
    offer: Array.isArray(p.offer)
      ? p.offer.map(o => ({ name: o?.name ?? '', price: o?.price ?? '' }))
      : [],
    qualificationQuestions: Array.isArray(p.qualificationQuestions)
      ? p.qualificationQuestions.map(q => ({ key: q?.key ?? '', question: q?.question ?? '' }))
      : [],
    objections: Array.isArray(p.objections)
      ? p.objections.map(o => ({ objection: o?.objection ?? '', response: o?.response ?? '' }))
      : [],
    scheduling: {
      enabled: p.scheduling?.enabled ?? false,
      types: Array.isArray(p.scheduling?.types) ? p.scheduling.types : [],
    },
  }
}

interface AgentSetupWizardProps {
  botId: string
}

export function AgentSetupWizard({ botId }: AgentSetupWizardProps) {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [step, setStep] = useState(0)
  const [maxStep, setMaxStep] = useState(0)

  const [profile, setProfile] = useState<AgentProfile>(emptyProfile())
  const [botConfig, setBotConfig] = useState<Record<string, unknown>>({})
  const [agentName, setAgentName] = useState('')
  const [tone, setTone] = useState('neutral')

  // Step 5: availability
  const [rules, setRules] = useState<AvailabilityRule[]>([])
  const [draftRules, setDraftRules] = useState<DraftRule[]>([])
  const [savingRules, setSavingRules] = useState(false)

  // Step 7: knowledge
  const [docs, setDocs] = useState<KnowledgeDoc[]>([])
  const [textName, setTextName] = useState('')
  const [textContent, setTextContent] = useState('')
  const [uploadingDoc, setUploadingDoc] = useState(false)

  const [applyingTemplate, setApplyingTemplate] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted])

  const loadAll = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [agents, rulesData, docsData] = await Promise.all([
        fetchAPI('/bots/agents'),
        fetchAPI('/availability/rules'),
        fetchAPI('/knowledge'),
      ])
      const bot = (Array.isArray(agents) ? (agents as BotAgentDTO[]) : []).find(a => a.id === botId)
      if (!bot) throw new Error('Agente no encontrado')

      setAgentName(bot.name ?? '')
      setTone(bot.tone ?? 'neutral')
      const config = (bot.config && typeof bot.config === 'object' ? bot.config : {}) as Record<string, unknown>
      setBotConfig(config)
      setProfile(normalizeProfile(config.profile))
      setRules(Array.isArray(rulesData) ? rulesData : [])
      setDocs(Array.isArray(docsData) ? docsData : [])
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Error al cargar el agente')
    } finally {
      setLoading(false)
    }
  }

  // ---------- Navigation ----------

  const goTo = (target: number) => {
    if (target < 0 || target >= STEPS.length) return
    if (target > maxStep + 1) return
    setStep(target)
    setMaxStep(prev => Math.max(prev, target))
  }

  // ---------- Template ----------

  const handleApplyTemplate = async () => {
    setApplyingTemplate(true)
    try {
      const updated = await fetchAPI(`/bots/${botId}/apply-template`, {
        method: 'POST',
        body: JSON.stringify({ template: 'solar' }),
      })
      const config = (updated?.config && typeof updated.config === 'object' ? updated.config : {}) as Record<string, unknown>
      setBotConfig(config)
      setProfile(normalizeProfile(config.profile))
      setMaxStep(STEPS.length - 1)
      toast.success('Plantilla Paneles Solares aplicada')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al aplicar la plantilla')
    } finally {
      setApplyingTemplate(false)
    }
  }

  // ---------- Final save ----------

  const handleSaveAndActivate = async () => {
    setSaving(true)
    try {
      await fetchAPI(`/bots/agents/${botId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: agentName.trim() || 'Agente',
          tone,
          isActive: true,
          config: { ...botConfig, profile },
        }),
      })
      toast.success('Agente configurado y activado')
      router.push(`/dashboard/bots/${botId}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar el agente')
    } finally {
      setSaving(false)
    }
  }

  // ---------- Availability rules ----------

  const handleSaveDraftRules = async () => {
    const valid = draftRules.filter(r => r.startTime && r.endTime && r.startTime < r.endTime)
    if (valid.length !== draftRules.length) {
      toast.error('Revisa los horarios: la hora de inicio debe ser menor que la de término')
      return
    }
    if (valid.length === 0) return
    setSavingRules(true)
    try {
      for (const rule of valid) {
        await fetchAPI('/availability/rules', {
          method: 'POST',
          body: JSON.stringify({
            dayOfWeek: rule.dayOfWeek,
            startTime: rule.startTime,
            endTime: rule.endTime,
            apptType: rule.apptType,
          }),
        })
      }
      const fresh = await fetchAPI('/availability/rules')
      setRules(Array.isArray(fresh) ? fresh : [])
      setDraftRules([])
      toast.success('Horarios guardados')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar los horarios')
    } finally {
      setSavingRules(false)
    }
  }

  const handleDeleteRule = async (id: string) => {
    try {
      await fetchAPI(`/availability/rules/${id}`, { method: 'DELETE' })
      setRules(prev => prev.filter(r => r.id !== id))
      toast.success('Horario eliminado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar el horario')
    }
  }

  // ---------- Knowledge ----------

  const refreshDocs = async () => {
    try {
      const fresh = await fetchAPI('/knowledge')
      setDocs(Array.isArray(fresh) ? fresh : [])
    } catch {
      // silent: list refresh failure is non-critical
    }
  }

  const handleAddText = async () => {
    if (!textName.trim() || !textContent.trim()) return
    setUploadingDoc(true)
    try {
      await fetchAPI('/knowledge', {
        method: 'POST',
        body: JSON.stringify({
          name: textName.trim(),
          sourceType: 'TEXT',
          content: textContent,
          botAgentId: botId,
        }),
      })
      setTextName('')
      setTextContent('')
      await refreshDocs()
      toast.success('Documento de texto ingresado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al ingresar el documento')
    } finally {
      setUploadingDoc(false)
    }
  }

  const handlePdfUpload = async (file: File) => {
    setUploadingDoc(true)
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = String(reader.result ?? '')
          resolve(result.includes(',') ? result.slice(result.indexOf(',') + 1) : result)
        }
        reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
        reader.readAsDataURL(file)
      })
      await fetchAPI('/knowledge', {
        method: 'POST',
        body: JSON.stringify({
          name: file.name,
          sourceType: 'PDF',
          content: base64,
          botAgentId: botId,
        }),
      })
      await refreshDocs()
      toast.success('PDF subido y procesado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al subir el PDF')
    } finally {
      setUploadingDoc(false)
    }
  }

  const handleDeleteDoc = async (id: string) => {
    try {
      await fetchAPI(`/knowledge/${id}`, { method: 'DELETE' })
      setDocs(prev => prev.filter(d => d.id !== id))
      toast.success('Documento eliminado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar el documento')
    }
  }

  // ---------- Profile field helpers ----------

  const setBusiness = (field: 'description' | 'coverage', value: string) =>
    setProfile(p => ({ ...p, business: { ...p.business, [field]: value } }))

  const toggleSchedulingType = (type: string) =>
    setProfile(p => ({
      ...p,
      scheduling: {
        ...p.scheduling,
        types: p.scheduling.types.includes(type)
          ? p.scheduling.types.filter(t => t !== type)
          : [...p.scheduling.types, type],
      },
    }))

  // ---------- Render guards ----------

  if (!mounted || loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-72 w-full rounded-xl" />
        <div className="flex justify-between">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-28" />
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <p className="text-sm text-muted-foreground">{loadError}</p>
        <Button variant="outline" onClick={loadAll}>Reintentar</Button>
      </div>
    )
  }

  const isLastStep = step === STEPS.length - 1

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <button
        onClick={() => router.push(`/dashboard/bots/${botId}`)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        ← Volver al agente
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Programa tu agente</h1>
          <p className="text-sm text-muted-foreground">
            Configura el playbook de ventas de {agentName || 'tu agente'} en 7 pasos.
          </p>
        </div>
        <Button variant="outline" onClick={handleApplyTemplate} disabled={applyingTemplate}>
          {applyingTemplate ? 'Aplicando...' : 'Usar plantilla Paneles Solares'}
        </Button>
      </div>

      {/* Progress indicator */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {STEPS.map((label, i) => {
          const reachable = i <= maxStep + 1
          const active = i === step
          return (
            <button
              key={label}
              onClick={() => goTo(i)}
              disabled={!reachable}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                active
                  ? 'bg-primary text-primary-foreground'
                  : reachable
                    ? 'bg-muted/40 text-foreground hover:bg-muted'
                    : 'bg-muted/20 text-muted-foreground cursor-not-allowed'
              }`}
            >
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                active ? 'bg-primary-foreground/20' : 'bg-background/60'
              }`}>
                {i + 1}
              </span>
              {label}
            </button>
          )
        })}
      </div>

      <Card className="border bg-card/60 backdrop-blur supports-[backdrop-filter]:bg-card/50">
        {step === 0 && (
          <>
            <CardHeader>
              <CardTitle>Negocio</CardTitle>
              <CardDescription>Describe qué vendes y dónde operas. El agente usará esto en cada conversación.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="biz-desc">Descripción del negocio</Label>
                <Textarea
                  id="biz-desc"
                  rows={4}
                  value={profile.business.description}
                  onChange={e => setBusiness('description', e.target.value)}
                  placeholder="Ej: Empresa de instalación de paneles solares residenciales y comerciales..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="biz-cov">Cobertura geográfica</Label>
                <Input
                  id="biz-cov"
                  value={profile.business.coverage}
                  onChange={e => setBusiness('coverage', e.target.value)}
                  placeholder="Ej: Región Metropolitana, Chile"
                />
              </div>
            </CardContent>
          </>
        )}

        {step === 1 && (
          <>
            <CardHeader>
              <CardTitle>Oferta</CardTitle>
              <CardDescription>Productos o servicios con su precio. El agente no inventará precios fuera de esta lista.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {profile.offer.length === 0 && (
                <p className="text-sm text-muted-foreground">Sin productos todavía. Agrega el primero.</p>
              )}
              {profile.offer.map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <Input
                    value={item.name}
                    onChange={e => setProfile(p => ({
                      ...p,
                      offer: p.offer.map((o, j) => (j === i ? { ...o, name: e.target.value } : o)),
                    }))}
                    placeholder="Nombre del producto o plan"
                    className="flex-1"
                  />
                  <Input
                    value={item.price}
                    onChange={e => setProfile(p => ({
                      ...p,
                      offer: p.offer.map((o, j) => (j === i ? { ...o, price: e.target.value } : o)),
                    }))}
                    placeholder="Precio (ej: desde $2.500.000)"
                    className="w-56"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setProfile(p => ({ ...p, offer: p.offer.filter((_, j) => j !== i) }))}
                  >
                    Quitar
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setProfile(p => ({ ...p, offer: [...p.offer, { name: '', price: '' }] }))}
              >
                + Agregar producto
              </Button>
            </CardContent>
          </>
        )}

        {step === 2 && (
          <>
            <CardHeader>
              <CardTitle>Calificación</CardTitle>
              <CardDescription>Preguntas que el agente hará de forma natural para calificar al lead.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {profile.qualificationQuestions.length === 0 && (
                <p className="text-sm text-muted-foreground">Sin preguntas todavía. Agrega la primera.</p>
              )}
              {profile.qualificationQuestions.map((q, i) => (
                <div key={i} className="flex items-start gap-2">
                  <Input
                    value={q.key}
                    onChange={e => setProfile(p => ({
                      ...p,
                      qualificationQuestions: p.qualificationQuestions.map((x, j) =>
                        j === i ? { ...x, key: e.target.value } : x),
                    }))}
                    placeholder="clave (ej: monthly_bill)"
                    className="w-48"
                  />
                  <Input
                    value={q.question}
                    onChange={e => setProfile(p => ({
                      ...p,
                      qualificationQuestions: p.qualificationQuestions.map((x, j) =>
                        j === i ? { ...x, question: e.target.value } : x),
                    }))}
                    placeholder="Pregunta (ej: ¿Cuánto pagas de luz al mes?)"
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setProfile(p => ({
                      ...p,
                      qualificationQuestions: p.qualificationQuestions.filter((_, j) => j !== i),
                    }))}
                  >
                    Quitar
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setProfile(p => ({
                  ...p,
                  qualificationQuestions: [...p.qualificationQuestions, { key: '', question: '' }],
                }))}
              >
                + Agregar pregunta
              </Button>
            </CardContent>
          </>
        )}

        {step === 3 && (
          <>
            <CardHeader>
              <CardTitle>Objeciones</CardTitle>
              <CardDescription>Objeciones frecuentes y cómo debe responderlas el agente.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {profile.objections.length === 0 && (
                <p className="text-sm text-muted-foreground">Sin objeciones todavía. Agrega la primera.</p>
              )}
              {profile.objections.map((o, i) => (
                <div key={i} className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-start gap-2">
                    <Input
                      value={o.objection}
                      onChange={e => setProfile(p => ({
                        ...p,
                        objections: p.objections.map((x, j) =>
                          j === i ? { ...x, objection: e.target.value } : x),
                      }))}
                      placeholder="Objeción (ej: Es muy caro)"
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setProfile(p => ({
                        ...p,
                        objections: p.objections.filter((_, j) => j !== i),
                      }))}
                    >
                      Quitar
                    </Button>
                  </div>
                  <Textarea
                    rows={2}
                    value={o.response}
                    onChange={e => setProfile(p => ({
                      ...p,
                      objections: p.objections.map((x, j) =>
                        j === i ? { ...x, response: e.target.value } : x),
                    }))}
                    placeholder="Respuesta sugerida"
                  />
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setProfile(p => ({
                  ...p,
                  objections: [...p.objections, { objection: '', response: '' }],
                }))}
              >
                + Agregar objeción
              </Button>
            </CardContent>
          </>
        )}

        {step === 4 && (
          <>
            <CardHeader>
              <CardTitle>Agendamiento</CardTitle>
              <CardDescription>Permite que el agente agende citas reales según tu disponibilidad semanal.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Agendamiento habilitado</p>
                  <p className="text-xs text-muted-foreground">El agente ofrecerá horarios disponibles y agendará por ti.</p>
                </div>
                <Switch
                  checked={profile.scheduling.enabled}
                  onCheckedChange={checked => setProfile(p => ({
                    ...p,
                    scheduling: { ...p.scheduling, enabled: checked },
                  }))}
                />
              </div>

              {profile.scheduling.enabled && (
                <>
                  <div className="space-y-2">
                    <Label>Tipos de cita</Label>
                    <div className="flex gap-2">
                      {(['SITE_VISIT', 'CALL'] as const).map(type => (
                        <button
                          key={type}
                          onClick={() => toggleSchedulingType(type)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                            profile.scheduling.types.includes(type)
                              ? 'border-primary bg-primary/15 text-primary'
                              : 'border-border bg-muted/20 text-muted-foreground hover:bg-muted/40'
                          }`}
                        >
                          {APPT_TYPE_LABELS[type]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label>Disponibilidad semanal</Label>
                    {rules.length === 0 && draftRules.length === 0 && (
                      <p className="text-sm text-muted-foreground">Sin horarios configurados. Agrega tu primera franja.</p>
                    )}
                    {rules.map(rule => (
                      <div key={rule.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                        <div className="flex items-center gap-3">
                          <span className="font-medium">{DAY_NAMES[rule.dayOfWeek] ?? rule.dayOfWeek}</span>
                          <span className="text-muted-foreground">{rule.startTime} – {rule.endTime}</span>
                          <Badge variant="outline">{APPT_TYPE_LABELS[rule.apptType] ?? rule.apptType}</Badge>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteRule(rule.id)}>
                          Eliminar
                        </Button>
                      </div>
                    ))}
                    {draftRules.map((rule, i) => (
                      <div key={`draft-${i}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-3">
                        <Select
                          value={String(rule.dayOfWeek)}
                          onValueChange={value => setDraftRules(prev =>
                            prev.map((r, j) => (j === i ? { ...r, dayOfWeek: Number(value) } : r)))}
                        >
                          <SelectTrigger className="w-36">
                            <SelectValue placeholder="Día" />
                          </SelectTrigger>
                          <SelectContent>
                            {DAY_NAMES.map((name, d) => (
                              <SelectItem key={d} value={String(d)}>{name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="time"
                          value={rule.startTime}
                          onChange={e => setDraftRules(prev =>
                            prev.map((r, j) => (j === i ? { ...r, startTime: e.target.value } : r)))}
                          className="w-28"
                        />
                        <span className="text-xs text-muted-foreground">a</span>
                        <Input
                          type="time"
                          value={rule.endTime}
                          onChange={e => setDraftRules(prev =>
                            prev.map((r, j) => (j === i ? { ...r, endTime: e.target.value } : r)))}
                          className="w-28"
                        />
                        <Select
                          value={rule.apptType}
                          onValueChange={value => setDraftRules(prev =>
                            prev.map((r, j) => (j === i ? { ...r, apptType: value } : r)))}
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue placeholder="Tipo" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="SITE_VISIT">Visita técnica</SelectItem>
                            <SelectItem value="CALL">Llamada</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDraftRules(prev => prev.filter((_, j) => j !== i))}
                        >
                          Quitar
                        </Button>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDraftRules(prev => [
                          ...prev,
                          { dayOfWeek: 1, startTime: '09:00', endTime: '18:00', apptType: profile.scheduling.types[0] ?? 'SITE_VISIT' },
                        ])}
                      >
                        + Agregar franja
                      </Button>
                      {draftRules.length > 0 && (
                        <Button size="sm" onClick={handleSaveDraftRules} disabled={savingRules}>
                          {savingRules ? 'Guardando...' : 'Guardar horarios'}
                        </Button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </>
        )}

        {step === 5 && (
          <>
            <CardHeader>
              <CardTitle>Persona</CardTitle>
              <CardDescription>Nombre y tono con que el agente conversa con tus clientes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="agent-name">Nombre del agente</Label>
                <Input
                  id="agent-name"
                  value={agentName}
                  onChange={e => setAgentName(e.target.value)}
                  placeholder="Ej: Sol"
                />
              </div>
              <div className="space-y-2">
                <Label>Tono</Label>
                <Select value={tone} onValueChange={setTone}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Tono" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="neutral">Neutral</SelectItem>
                    <SelectItem value="formal">Formal</SelectItem>
                    <SelectItem value="casual">Casual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </>
        )}

        {step === 6 && (
          <>
            <CardHeader>
              <CardTitle>Documentos</CardTitle>
              <CardDescription>Base de conocimiento del agente: FAQs, fichas técnicas y catálogos (texto o PDF).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2 rounded-lg border p-3">
                <Label htmlFor="doc-name">Agregar texto</Label>
                <Input
                  id="doc-name"
                  value={textName}
                  onChange={e => setTextName(e.target.value)}
                  placeholder="Nombre del documento (ej: FAQ garantías)"
                />
                <Textarea
                  rows={4}
                  value={textContent}
                  onChange={e => setTextContent(e.target.value)}
                  placeholder="Pega aquí el contenido que el agente debe conocer..."
                />
                <Button
                  size="sm"
                  onClick={handleAddText}
                  disabled={uploadingDoc || !textName.trim() || !textContent.trim()}
                >
                  {uploadingDoc ? 'Procesando...' : 'Ingresar texto'}
                </Button>
              </div>

              <div className="space-y-2 rounded-lg border p-3">
                <Label htmlFor="doc-pdf">Subir PDF</Label>
                <input
                  id="doc-pdf"
                  type="file"
                  accept="application/pdf"
                  disabled={uploadingDoc}
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) handlePdfUpload(file)
                    e.target.value = ''
                  }}
                  className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border file:border-border file:bg-muted/30 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground hover:file:bg-muted/50"
                />
              </div>

              <div className="space-y-2">
                <Label>Documentos cargados</Label>
                {docs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin documentos todavía.</p>
                ) : (
                  <div className="space-y-2">
                    {docs.map(doc => (
                      <div key={doc.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-medium">{doc.name}</span>
                          <Badge variant="secondary" className="shrink-0">{doc.sourceType}</Badge>
                          <Badge
                            variant="outline"
                            className={`shrink-0 ${DOC_STATUS_STYLES[doc.status] ?? ''}`}
                            title={doc.status === 'ERROR' ? (doc.error ?? 'Error desconocido') : undefined}
                          >
                            {DOC_STATUS_LABELS[doc.status] ?? doc.status}
                          </Badge>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteDoc(doc.id)}>
                          Eliminar
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </>
        )}
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => goTo(step - 1)} disabled={step === 0}>
          Atrás
        </Button>
        {isLastStep ? (
          <Button onClick={handleSaveAndActivate} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar y activar'}
          </Button>
        ) : (
          <Button onClick={() => goTo(step + 1)}>Siguiente</Button>
        )}
      </div>
    </div>
  )
}
