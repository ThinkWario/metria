'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { fetchAPI } from '@/lib/api'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import ContactTimeline from '@/components/crm/ContactTimeline'
import ContactTasks from '@/components/crm/ContactTasks'
import { Trophy, Wallet, ShoppingBag, GitBranch, Pencil, TrendingUp } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'

/** Compact CLP formatter — mirrors PipelineForecast / PipelinesClient idiom. */
function formatCLP(n: number): string {
  if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return '$' + Math.round(n / 1_000) + 'K'
  return '$' + Math.round(n).toLocaleString('es-CL')
}

interface ContactValue {
  ltv: number
  wonDealsValue: number
  wonDealsCount: number
  openPipelineValue: number
  openDealsCount: number
  lostDealsCount: number
  capturedValue: number
  ordersTotal?: number
  ordersCount?: number
}

interface RevenueSummary {
  contactRevenue: {
    totalRevenue: number
    orderCount: number
    lastPurchaseDate: string | null
    avgOrderValue: number
  }
  workspaceContext: {
    avgROAS: number | null
    totalAdSpend30d: number
    totalRevenue30d: number
    netProfit30d: number
  }
  contactAttribution: {
    source: string | null
    estimatedAdCost: null
    note: string
  }
}

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
const TEMP_COLOR: Record<string, string> = {
  COLD: 'bg-blue-100 text-blue-700', WARM: 'bg-orange-100 text-orange-700', HOT: 'bg-red-100 text-red-700'
}
const LEAD_TYPE_COLOR: Record<string, string> = {
  CURIOUS: 'bg-purple-100 text-purple-700', QUOTING: 'bg-indigo-100 text-indigo-700',
  READY_TO_BUY: 'bg-green-100 text-green-700', POST_SALE: 'bg-teal-100 text-teal-700'
}

const FINANCING_FIELDS: Array<[key: string, label: string]> = [
  ['edad', 'Edad'], ['estadoCivil', 'Estado civil'], ['valorCasa', 'Valor de la vivienda'],
  ['deudaCasa', 'Deuda de la vivienda'], ['ingresoMensual', 'Ingreso mensual'],
  ['profesion', 'Profesión'], ['deudaContribuciones', 'Deuda de contribuciones'], ['embargoVigente', 'Embargo vigente']
]

/**
 * Todo lo que ya se muestra por su propio campo con nombre (cards de arriba)
 * o que ya vive en una columna escalar del Contact (Task 3/4) — el resto de
 * `rawFields` cae en la card genérica "Otros datos" más abajo. Esta lista es
 * el único lugar que hay que tocar si `StepData` agrega un campo nuevo y
 * quieres que deje de aparecer ahí para pasar a tener su propia UI.
 */
const KNOWN_RAW_FIELD_KEYS = new Set<string>([
  'propertyType', 'ownershipType', 'techoConfirmado', 'materialTecho', 'comuna', 'direccion',
  'houseMapUrl', 'meterMapUrl', 'montoBoleta', 'distribuidora', 'consumoHorario', 'empalme', 'plazoInstalacion',
  ...FINANCING_FIELDS.map(([key]) => key),
  // Ya persisten como columnas escalares del Contact (Task 3/4), no hace
  // falta repetirlos desde el JSON crudo:
  'nombre', 'telefono', 'email', 'utmSource', 'utmMedium', 'utmCampaign', 'utmContent', 'utmTerm',
  'fbclid', 'metaCampaignId', 'metaAdsetId', 'metaAdId', 'landingUrl', 'referrer',
  'metaFbc', 'metaFbp', 'clientIpAddress', 'clientUserAgent',
  // Bookkeeping interno del wizard/endpoint, no es un dato del lead:
  'sessionId', 'step', 'timestamp', 'action', 'status', 'consentAccepted', 'consentVersion'
])

/**
 * Validates a URL before it's ever used as an href — houseMapUrl/meterMapUrl
 * and the quote link ultimately come from data posted to a public endpoint
 * (see solarLead.routes.ts), so they're treated as hostile input, same as
 * any other external URL rendered from stored data (react/security.md).
 */
function safeExternalUrl(url?: string | null): string | undefined {
  if (!url) return undefined
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:') return url
  } catch {
    // not a valid URL — fall through to undefined
  }
  return undefined
}

/** Solar-specific detail cards — only rendered for source === 'solar_direct'. */
function SolarLeadCard({ contact }: { contact: Contact }) {
  const raw = (contact.qualificationData?.rawFields ?? {}) as Record<string, string>
  const qualificationStatus = contact.qualificationData?.qualificationStatus as string | undefined
  const qualificationSummary = contact.qualificationData?.qualificationSummary as string | undefined
  const hasFinancing = FINANCING_FIELDS.some(([key]) => raw[key])
  const quoteUrl = contact.sessionId
    ? safeExternalUrl(`https://solar.drillchile.cl/cotizaciones?session=${contact.sessionId}`)
    : undefined
  const houseMapUrl = safeExternalUrl(raw.houseMapUrl)
  const meterMapUrl = safeExternalUrl(raw.meterMapUrl)
  const otherFields = Object.entries(raw).filter(
    ([key, value]) => !KNOWN_RAW_FIELD_KEYS.has(key) && value !== undefined && value !== null && value !== ''
  )

  return (
    <>
      {qualificationStatus && (
        <div className="rounded-lg border p-4 space-y-2 md:col-span-2">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Calificación</h3>
          <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${TEMP_COLOR[contact.leadTemperature ?? ''] ?? 'bg-gray-100 text-gray-700'}`}>
            {qualificationStatus}
          </span>
          {qualificationSummary && <p className="text-sm text-muted-foreground">{qualificationSummary}</p>}
        </div>
      )}

      <div className="rounded-lg border p-4 space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Propiedad y techo</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Field label="Tipo de propiedad" value={raw.propertyType} />
          <Field label="Tipo de tenencia" value={raw.ownershipType} />
          <Field label="Techo confirmado" value={raw.techoConfirmado === 'true' ? 'Sí' : raw.techoConfirmado === 'false' ? 'No' : undefined} />
          <Field label="Material del techo" value={raw.materialTecho} />
          <Field label="Comuna" value={raw.comuna} />
          <Field label="Dirección" value={raw.direccion} />
        </div>
        {(houseMapUrl || meterMapUrl) && (
          <div className="flex flex-wrap gap-3 pt-1 border-t text-sm">
            {houseMapUrl && (
              <a href={houseMapUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
                Ver ubicación de la casa
              </a>
            )}
            {meterMapUrl && (
              <a href={meterMapUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
                Ver ubicación del medidor
              </a>
            )}
          </div>
        )}
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Consumo eléctrico</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Field label="Monto boleta" value={raw.montoBoleta} />
          <Field label="Distribuidora" value={raw.distribuidora} />
          <Field label="Consumo horario" value={raw.consumoHorario} />
          <Field label="Empalme" value={raw.empalme} />
          <Field label="Plazo de instalación" value={raw.plazoInstalacion} />
        </div>
      </div>

      {hasFinancing && (
        <div className="rounded-lg border border-orange-300 bg-orange-50/50 p-4 space-y-3">
          <h3 className="text-sm font-medium text-orange-700 uppercase tracking-wide">Solicitud de financiamiento</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {FINANCING_FIELDS.map(([key, label]) => <Field key={key} label={label} value={raw[key]} />)}
          </div>
        </div>
      )}

      {quoteUrl && (
        <div className="rounded-lg border p-4">
          <a href={quoteUrl} target="_blank" rel="noopener noreferrer"
             className="inline-block px-3 py-1.5 text-sm rounded-lg border hover:bg-muted">
            Ver cotización
          </a>
        </div>
      )}

      <div className="rounded-lg border p-4 space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Atribución / Meta Ads</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Field label="Campaña" value={contact.metaCampaignId} />
          <Field label="Conjunto de anuncios" value={contact.metaAdsetId} />
          <Field label="Anuncio" value={contact.metaAdId} />
          <Field label="UTM source" value={contact.utmSource} />
          <Field label="UTM medium" value={contact.utmMedium} />
          <Field label="UTM campaign" value={contact.utmCampaign} />
          <Field label="Landing" value={contact.landingUrl} />
          <Field label="Referrer" value={contact.referrer} />
          <Field label="Fbclid" value={contact.fbclid} />
        </div>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Consentimiento</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Field label="Versión" value={contact.consentVersion} />
          <Field label="Estado" value={contact.consentStatus} />
          <Field label="Fecha" value={contact.consentAt ? new Date(contact.consentAt).toLocaleString('es-CL') : undefined} />
        </div>
      </div>

      {otherFields.length > 0 && (
        <div className="rounded-lg border p-4 space-y-3 md:col-span-2">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Otros datos</h3>
          <p className="text-xs text-muted-foreground">
            Campos capturados por el wizard sin sección dedicada — cubre RUT, coordenadas crudas de mapa,
            y los campos de otras líneas de servicio (perforación/bombeo/mantención) que StepData también tipa.
          </p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {otherFields.map(([key, value]) => <Field key={key} label={key} value={String(value)} />)}
          </div>
        </div>
      )}
    </>
  )
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  )
}

type Tab = 'resumen' | 'conversaciones' | 'deals' | 'tickets' | 'notas' | 'actividad' | 'tareas'

interface SolarResV2Criteria {
  serviceAreaMatch: boolean
  ownerOrDecisionMaker: boolean
  technicalFitPreliminary: boolean
  billBandEligible: boolean
}

function CriterionRow({ label, met }: { label: string; met: boolean }) {
  return (
    <li className={met ? 'text-green-700' : 'text-muted-foreground'}>
      {met ? '✓' : '○'} {label}
    </li>
  )
}

/**
 * Gate de validación humana para QualifiedLead (dev3007: "regla solar_res_v2
 * o validación humana autorizada" — INSTRUCCIONES_DESARROLLADOR_TRACKING_METRIA_SOLAR_AGOSTO_2026.md
 * §9). leadIngestion.service.ts ya NO dispara QualifiedLead automáticamente;
 * esta card es el único lugar desde donde se confirma.
 */
function QualifiedLeadConfirmCard({ contact, onConfirmed }: { contact: Contact; onConfirmed: (patch: Partial<Contact>) => void }) {
  const qd = (contact.qualificationData ?? {}) as Record<string, unknown>
  const criteria = qd.solarResV2Criteria as SolarResV2Criteria | undefined
  const alreadyConfirmed = !!qd.qualifiedLeadConfirmedAt
  const [showOverride, setShowOverride] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!criteria || alreadyConfirmed) return null

  const allMet = criteria.serviceAreaMatch && criteria.ownerOrDecisionMaker
    && criteria.technicalFitPreliminary && criteria.billBandEligible

  async function confirm(override: boolean) {
    setSubmitting(true)
    try {
      const updated = await fetchAPI(`/crm/contacts/${contact.id}/confirm-qualified-lead`, {
        method: 'POST',
        body: JSON.stringify(override ? { override: true, overrideReason } : {})
      })
      onConfirmed(updated)
      toast.success('Lead calificado confirmado — evento enviado a Meta')
      setShowOverride(false)
    } catch {
      toast.error('No se pudo confirmar el lead calificado')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-lg border p-4 space-y-3 md:col-span-2">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Confirmación QualifiedLead (solar_res_v2)</h3>
      <ul className="text-sm space-y-1">
        <CriterionRow label="Zona de cobertura" met={criteria.serviceAreaMatch} />
        <CriterionRow label="Propietario/decisor" met={criteria.ownerOrDecisionMaker} />
        <CriterionRow label="Aptitud técnica preliminar (techo)" met={criteria.technicalFitPreliminary} />
        <CriterionRow label="Banda de boleta elegible" met={criteria.billBandEligible} />
      </ul>
      {allMet ? (
        <button type="button" disabled={submitting} onClick={() => confirm(false)}
          className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-50">
          Confirmar Lead Calificado
        </button>
      ) : showOverride ? (
        <div className="space-y-2">
          <textarea value={overrideReason} onChange={e => setOverrideReason(e.target.value)}
            placeholder="Motivo de la excepción (obligatorio)"
            className="w-full text-sm border rounded-md p-2" rows={2} />
          <div className="flex gap-2">
            <button type="button" disabled={submitting || !overrideReason.trim()} onClick={() => confirm(true)}
              className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-50">
              Confirmar con excepción
            </button>
            <button type="button" onClick={() => setShowOverride(false)} className="text-sm px-3 py-1.5 rounded-md border">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setShowOverride(true)} className="text-sm px-3 py-1.5 rounded-md border">
          No cumple todos los criterios — confirmar con excepción
        </button>
      )}
    </div>
  )
}

interface Contact {
  id: string; name: string; email: string | null; phone: string | null; status: string
  ltv: string; healthScore: number | null; source: string; createdAt: string
  leadScore: number | null; leadTemperature: string | null; leadType: string | null
  tags: { id: string; name: string; color: string }[]
  contactNotes: { id: string; content: string; createdAt: string; userId: string }[]
  deals: { id: string; title: string; value: string; status: string; stage: { name: string; color: string } }[]
  tickets: { id: string; title: string; status: string; priority: string; createdAt: string; slaDeadline: string | null }[]
  conversations: { id: string; status: string; messageCount: number; lastMessageAt: string | null; channel: { platform: string; name: string } }[]
  customFields?: Record<string, string> | null
  sessionId: string | null
  qualificationData: Record<string, unknown> | null
  utmSource: string | null; utmMedium: string | null; utmCampaign: string | null
  metaCampaignId: string | null; metaAdsetId: string | null; metaAdId: string | null
  fbclid: string | null; landingUrl: string | null; referrer: string | null
  consentVersion: string | null; consentAt: string | null; consentStatus: string | null
}

interface CustomFieldDefinition {
  id: string
  key: string
  label: string
}

interface DuplicateContact {
  id: string; name: string; phone: string | null; email: string | null; source: string; status: string; createdAt: string
}

export default function ContactProfileClient({ contactId }: { contactId: string }) {
  const [mounted, setMounted] = useState(false)
  const [contact, setContact] = useState<Contact | null>(null)
  const [loading, setLoading] = useState(true)
  const [contactError, setContactError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [tab, setTab] = useState<Tab>('resumen')
  const [noteContent, setNoteContent] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [value, setValue] = useState<ContactValue | null>(null)
  const [valueLoading, setValueLoading] = useState(true)
  const [valueError, setValueError] = useState(false)
  const [revenue, setRevenue] = useState<RevenueSummary | null>(null)
  const [revenueLoading, setRevenueLoading] = useState(true)
  const [revenueError, setRevenueError] = useState(false)
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [duplicates, setDuplicates] = useState<DuplicateContact[]>([])
  const [mergeCandidate, setMergeCandidate] = useState<DuplicateContact | null>(null)
  const [merging, setMerging] = useState(false)
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDefinition[]>([])
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({})
  const [savingCustomFields, setSavingCustomFields] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    setLoading(true)
    setContactError(null)
    fetchAPI(`/crm/contacts/${contactId}`)
      .then(setContact)
      .catch((err) => {
        console.error(err)
        setContactError(err instanceof Error ? err.message : 'Error desconocido')
      })
      .finally(() => setLoading(false))
  }, [mounted, contactId, reloadKey])

  useEffect(() => {
    if (!mounted) return
    setValueLoading(true)
    setValueError(false)
    fetchAPI(`/crm/contacts/${contactId}/value`)
      .then(setValue)
      .catch(() => setValueError(true))
      .finally(() => setValueLoading(false))
  }, [mounted, contactId])

  useEffect(() => {
    if (!mounted) return
    setRevenueLoading(true)
    setRevenueError(false)
    fetchAPI(`/crm/contacts/${contactId}/revenue-summary`)
      .then(setRevenue)
      .catch(() => setRevenueError(true))
      .finally(() => setRevenueLoading(false))
  }, [mounted, contactId])

  useEffect(() => {
    if (!mounted) return
    fetchAPI(`/crm/contacts/${contactId}/duplicates`)
      .then(setDuplicates)
      .catch(() => setDuplicates([]))
  }, [mounted, contactId])

  useEffect(() => {
    if (!mounted) return
    fetchAPI('/crm/custom-fields')
      .then(setCustomFieldDefs)
      .catch(() => setCustomFieldDefs([]))
  }, [mounted])

  useEffect(() => {
    if (contact) setCustomFieldValues(contact.customFields ?? {})
  }, [contact])

  async function handleSaveCustomFields() {
    if (savingCustomFields) return
    setSavingCustomFields(true)
    try {
      await fetchAPI(`/crm/contacts/${contactId}/custom-fields`, {
        method: 'PATCH',
        body: JSON.stringify({ values: customFieldValues })
      })
      toast.success('Campos guardados')
    } catch {
      toast.error('Error al guardar los campos personalizados')
    } finally {
      setSavingCustomFields(false)
    }
  }

  async function handleMergeConfirm() {
    if (!mergeCandidate || merging) return
    setMerging(true)
    try {
      await fetchAPI(`/crm/contacts/${contactId}/merge`, {
        method: 'POST',
        body: JSON.stringify({ duplicateContactId: mergeCandidate.id })
      })
      toast.success('Contactos fusionados')
      setDuplicates(prev => prev.filter(d => d.id !== mergeCandidate.id))
      setMergeCandidate(null)
    } catch {
      toast.error('Error al fusionar los contactos')
    } finally {
      setMerging(false)
    }
  }

  async function handleStatusChange(newStatus: string) {
    if (!contact || newStatus === contact.status) return
    const prevStatus = contact.status
    setContact(prev => prev ? { ...prev, status: newStatus } : prev)
    try {
      await fetchAPI(`/crm/contacts/${contactId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus })
      })
      toast.success('Estado actualizado')
    } catch {
      setContact(prev => prev ? { ...prev, status: prevStatus } : prev)
      toast.error('Error al actualizar el estado')
    }
  }

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

  function openEditDialog() {
    if (!contact) return
    setEditName(contact.name)
    setEditEmail(contact.email ?? '')
    setEditPhone(contact.phone?.split('@')[0] ?? '')
    setEditOpen(true)
  }

  async function handleEditSave() {
    if (!contact || savingEdit) return
    const newName = editName.trim()
    if (!newName) { toast.error('El nombre no puede estar vacío'); return }
    setSavingEdit(true)
    const prev = { name: contact.name, email: contact.email, phone: contact.phone }
    const payload = { name: newName, email: editEmail.trim() || null, phone: editPhone.trim() || null }
    setContact(c => c ? { ...c, ...payload } : c)
    try {
      await fetchAPI(`/crm/contacts/${contactId}`, { method: 'PATCH', body: JSON.stringify(payload) })
      toast.success('Contacto actualizado')
      setEditOpen(false)
    } catch {
      setContact(c => c ? { ...c, ...prev } : c)
      toast.error('Error al actualizar el contacto')
    } finally { setSavingEdit(false) }
  }

  async function handleTemperatureChange(newVal: string) {
    if (!contact) return
    const temperature: string | null = newVal || null
    if (temperature === contact.leadTemperature) return
    const prev = contact.leadTemperature
    setContact(c => c ? { ...c, leadTemperature: temperature } : c)
    try {
      await fetchAPI(`/crm/contacts/${contactId}`, { method: 'PATCH', body: JSON.stringify({ temperature }) })
      toast.success('Temperatura actualizada')
    } catch {
      setContact(c => c ? { ...c, leadTemperature: prev } : c)
      toast.error('Error al actualizar la temperatura')
    }
  }

  async function handleContactTypeChange(newVal: string) {
    if (!contact) return
    const contactType: string | null = newVal || null
    if (contactType === contact.leadType) return
    const prev = contact.leadType
    setContact(c => c ? { ...c, leadType: contactType } : c)
    try {
      await fetchAPI(`/crm/contacts/${contactId}`, { method: 'PATCH', body: JSON.stringify({ contactType }) })
      toast.success('Tipo de contacto actualizado')
    } catch {
      setContact(c => c ? { ...c, leadType: prev } : c)
      toast.error('Error al actualizar el tipo de contacto')
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
    const isNotFound = contactError === 'Contact not found'
    return (
      <div className="text-center py-16 text-muted-foreground space-y-2">
        <p>{isNotFound ? 'Contacto no encontrado.' : `Error al cargar el contacto: ${contactError ?? 'desconocido'}`}</p>
        <div className="flex justify-center gap-4">
          {!isNotFound && (
            <button className="underline" onClick={() => setReloadKey(k => k + 1)}>Reintentar</button>
          )}
          <button className="underline" onClick={() => router.back()}>Volver</button>
        </div>
      </div>
    )
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'resumen', label: 'Resumen' },
    { key: 'conversaciones', label: `Conversaciones (${contact.conversations?.length ?? 0})` },
    { key: 'deals', label: `Deals (${contact.deals?.length ?? 0})` },
    { key: 'tickets', label: `Tickets (${contact.tickets?.length ?? 0})` },
    { key: 'notas', label: `Notas (${contact.contactNotes?.length ?? 0})` },
    { key: 'actividad', label: 'Actividad' },
    { key: 'tareas', label: 'Tareas' },
  ]

  return (
    <div className="space-y-6">
      {duplicates.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <p className="text-sm font-medium text-amber-600 dark:text-amber-400">Posible contacto duplicado</p>
          {duplicates.map(dup => (
            <div key={dup.id} className="flex items-center justify-between mt-2 gap-2">
              <span className="text-sm text-muted-foreground truncate">
                {dup.name} · {PLATFORM_LABEL[dup.source] ?? dup.source}
              </span>
              <button
                onClick={() => setMergeCandidate(dup)}
                className="shrink-0 px-3 py-1.5 text-sm rounded-lg border hover:bg-muted"
              >
                Fusionar
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="text-sm text-muted-foreground hover:text-foreground">← Volver</button>
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-lg font-bold uppercase">
          {contact.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h1 className="text-xl font-semibold truncate">{contact.name}</h1>
            <button onClick={openEditDialog} className="text-muted-foreground hover:text-foreground p-0.5 rounded" aria-label="Editar contacto">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-sm text-muted-foreground">{contact.phone?.split('@')[0] ?? contact.email ?? '—'}</p>
        </div>
        <Select value={contact.status} onValueChange={handleStatusChange}>
          <SelectTrigger
            className={`ml-2 h-6 text-xs font-medium px-2.5 rounded-full border-0 shadow-none w-auto min-w-0 gap-1 focus:ring-0 focus:ring-offset-0 ${STATUS_COLOR[contact.status] ?? 'bg-muted'}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="LEAD">Lead</SelectItem>
            <SelectItem value="PROSPECT">Prospecto</SelectItem>
            <SelectItem value="CUSTOMER">Cliente</SelectItem>
            <SelectItem value="VIP">VIP</SelectItem>
            <SelectItem value="CHURNED">Inactivo</SelectItem>
          </SelectContent>
        </Select>
        <Select value={contact.leadTemperature ?? 'NONE'} onValueChange={(v) => handleTemperatureChange(v === 'NONE' ? '' : v)}>
          <SelectTrigger className={`h-6 text-xs font-medium px-2.5 rounded-full border-0 shadow-none w-auto min-w-0 gap-1 focus:ring-0 focus:ring-offset-0 ${TEMP_COLOR[contact.leadTemperature ?? ''] ?? 'bg-muted/50 text-muted-foreground'}`}>
            <SelectValue placeholder="Temperatura" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="NONE">Sin definir</SelectItem>
            <SelectItem value="COLD">Frío</SelectItem>
            <SelectItem value="WARM">Tibio</SelectItem>
            <SelectItem value="HOT">Caliente</SelectItem>
          </SelectContent>
        </Select>
        <Select value={contact.leadType ?? 'NONE'} onValueChange={(v) => handleContactTypeChange(v === 'NONE' ? '' : v)}>
          <SelectTrigger className={`h-6 text-xs font-medium px-2.5 rounded-full border-0 shadow-none w-auto min-w-0 gap-1 focus:ring-0 focus:ring-offset-0 ${LEAD_TYPE_COLOR[contact.leadType ?? ''] ?? 'bg-muted/50 text-muted-foreground'}`}>
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="NONE">Sin definir</SelectItem>
            <SelectItem value="CURIOUS">Curioso</SelectItem>
            <SelectItem value="QUOTING">Cotizando</SelectItem>
            <SelectItem value="READY_TO_BUY">Listo para comprar</SelectItem>
            <SelectItem value="POST_SALE">Post-venta</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Single flat tab bar */}
      <div className="border-b flex gap-1 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
              tab === t.key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="pt-2">
        {tab === 'resumen' && (
          <div className="space-y-4">
            <CustomerValueCard value={value} loading={valueLoading} error={valueError} />
            <EcommercePerformanceCard revenue={revenue} loading={revenueLoading} error={revenueError} hasEmail={!!contact.email} />
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
            {customFieldDefs.length > 0 && (
              <div className="rounded-lg border p-4 space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Campos personalizados</h3>
                {customFieldDefs.map(def => (
                  <div key={def.id} className="space-y-1">
                    <label htmlFor={`cf-${def.key}`} className="text-xs text-muted-foreground">{def.label}</label>
                    <input
                      id={`cf-${def.key}`}
                      aria-label={def.label}
                      className="w-full h-8 text-sm border rounded-md px-2 bg-background"
                      value={customFieldValues[def.key] ?? ''}
                      onChange={e => setCustomFieldValues(prev => ({ ...prev, [def.key]: e.target.value }))}
                    />
                  </div>
                ))}
                <button
                  onClick={handleSaveCustomFields}
                  disabled={savingCustomFields}
                  className="px-3 py-1.5 text-sm rounded-lg border hover:bg-muted disabled:opacity-50"
                >
                  {savingCustomFields ? 'Guardando...' : 'Guardar campos'}
                </button>
              </div>
            )}
            {contact.source === 'solar_direct' && (
              <>
                <SolarLeadCard contact={contact} />
                <QualifiedLeadConfirmCard contact={contact} onConfirmed={(patch) => setContact(c => c ? { ...c, ...patch } : c)} />
              </>
            )}
            </div>
          </div>
        )}

        {tab === 'conversaciones' && (
          <div className="space-y-2">
            {(contact.conversations?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">Sin conversaciones</p>
            ) : contact.conversations!.map(conv => (
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
                <span className="font-semibold tabular-nums">{formatCLP(Number(deal.value))}</span>
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

        {tab === 'actividad' && (
          <ContactTimeline contactId={contact.id} />
        )}

        {tab === 'tareas' && (
          <ContactTasks contactId={contact.id} />
        )}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar contacto</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Nombre</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                placeholder="Nombre del contacto"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <input
                type="email"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
                value={editEmail}
                onChange={e => setEditEmail(e.target.value)}
                placeholder="email@ejemplo.com"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Teléfono</label>
              <input
                type="tel"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background"
                value={editPhone}
                onChange={e => setEditPhone(e.target.value)}
                placeholder="+56 9 1234 5678"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setEditOpen(false)}
              className="px-3 py-1.5 text-sm rounded-lg border hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              onClick={handleEditSave}
              disabled={savingEdit}
              className="px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
            >
              {savingEdit ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!mergeCandidate} onOpenChange={(open) => !open && setMergeCandidate(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Fusionar contactos</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Se moverán conversaciones, deals, tickets y notas de <strong>{mergeCandidate?.name}</strong> ({mergeCandidate ? (PLATFORM_LABEL[mergeCandidate.source] ?? mergeCandidate.source) : ''}) a este contacto, y el duplicado se eliminará. Esta acción no se puede deshacer.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setMergeCandidate(null)}
              className="px-3 py-1.5 text-sm rounded-lg border hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              onClick={handleMergeConfirm}
              disabled={merging}
              className="px-3 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground disabled:opacity-50"
            >
              {merging ? 'Fusionando...' : 'Confirmar fusión'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ── Performance e-commerce ─────────────────────────────────────────────────
   ROAS del workspace (30d) + pedidos del contacto cruzados por email. */
function EcommercePerformanceCard({
  revenue, loading, error, hasEmail
}: { revenue: RevenueSummary | null; loading: boolean; error: boolean; hasEmail: boolean }) {
  if (loading) {
    return (
      <div className="rounded-xl border p-5 animate-pulse space-y-3">
        <div className="h-3 w-40 bg-muted/50 rounded" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 bg-muted/40 rounded-lg" />)}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border p-5 text-sm text-muted-foreground">
        No se pudo cargar el rendimiento e-commerce.
      </div>
    )
  }

  if (!hasEmail) {
    return (
      <div className="rounded-xl border p-4 text-sm text-muted-foreground flex items-center gap-2">
        <ShoppingBag className="h-4 w-4 shrink-0" />
        Sin email — no se pueden cruzar pedidos de Shopify con este contacto.
      </div>
    )
  }

  if (!revenue) {
    return (
      <div className="rounded-xl border p-5 text-sm text-muted-foreground">
        Sin datos de ingresos disponibles.
      </div>
    )
  }

  const r = revenue
  const hasOrders = r.contactRevenue.orderCount > 0

  return (
    <div className="rounded-xl border bg-gradient-to-br from-violet-500/[0.05] to-transparent p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-600/90 dark:text-violet-400/90">
          Performance E-commerce
        </p>
        <TrendingUp className="h-4 w-4 text-violet-500" />
      </div>

      {/* Contact orders */}
      {hasOrders ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="rounded-lg border bg-background/60 p-3">
            <p className="text-[11px] text-muted-foreground">Ingresos totales</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{formatCLP(r.contactRevenue.totalRevenue)}</p>
            <p className="text-[11px] text-muted-foreground">{r.contactRevenue.orderCount} pedido{r.contactRevenue.orderCount !== 1 ? 's' : ''}</p>
          </div>
          <div className="rounded-lg border bg-background/60 p-3">
            <p className="text-[11px] text-muted-foreground">Ticket promedio</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{formatCLP(r.contactRevenue.avgOrderValue)}</p>
          </div>
          {r.contactRevenue.lastPurchaseDate && (
            <div className="rounded-lg border bg-background/60 p-3">
              <p className="text-[11px] text-muted-foreground">Último pedido</p>
              <p className="mt-1 text-sm font-medium">{new Date(r.contactRevenue.lastPurchaseDate).toLocaleDateString('es-CL')}</p>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Sin pedidos registrados en Shopify para este email.</p>
      )}

      {/* Workspace ROAS context */}
      <div className="border-t pt-3 space-y-2">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Contexto workspace (últimos 30 días)</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border bg-background/60 p-3">
            <p className="text-[11px] text-muted-foreground">ROAS promedio</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {r.workspaceContext.avgROAS !== null ? `${r.workspaceContext.avgROAS}x` : '—'}
            </p>
          </div>
          <div className="rounded-lg border bg-background/60 p-3">
            <p className="text-[11px] text-muted-foreground">Inversión ads</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{formatCLP(r.workspaceContext.totalAdSpend30d)}</p>
          </div>
          <div className="rounded-lg border bg-background/60 p-3">
            <p className="text-[11px] text-muted-foreground">Ingresos</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{formatCLP(r.workspaceContext.totalRevenue30d)}</p>
          </div>
          <div className="rounded-lg border bg-background/60 p-3">
            <p className="text-[11px] text-muted-foreground">Ganancia neta</p>
            <p className={`mt-1 text-lg font-semibold tabular-nums ${r.workspaceContext.netProfit30d < 0 ? 'text-destructive' : 'text-emerald-600'}`}>
              {formatCLP(r.workspaceContext.netProfit30d)}
            </p>
          </div>
        </div>
        {r.contactAttribution.source && (
          <p className="text-[11px] text-muted-foreground">
            Fuente: <span className="font-medium">{r.contactAttribution.source}</span>
            {' · '}{r.contactAttribution.note}
          </p>
        )}
      </div>
    </div>
  )
}

/* ── Valor del cliente ──────────────────────────────────────────────────────
   Metria's differentiator: real, per-customer value a generic CRM can't show.
   Hero number = valor real capturado (ventas ganadas + pedidos pagados),
   con KPIs de apoyo. Estados de carga / error / vacío (ceros). */
function CustomerValueCard({
  value, loading, error
}: { value: ContactValue | null; loading: boolean; error: boolean }) {
  if (loading) {
    return (
      <div className="rounded-xl border bg-gradient-to-br from-emerald-500/[0.06] to-transparent p-5 animate-pulse">
        <div className="h-3 w-32 bg-muted/50 rounded mb-3" />
        <div className="h-9 w-40 bg-muted/50 rounded mb-5" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 bg-muted/40 rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border p-5 text-sm text-muted-foreground">
        No se pudo cargar el valor del cliente.
      </div>
    )
  }

  const v: ContactValue = value ?? {
    ltv: 0, wonDealsValue: 0, wonDealsCount: 0,
    openPipelineValue: 0, openDealsCount: 0, lostDealsCount: 0, capturedValue: 0
  }

  const kpis: { label: string; amount: number; meta?: string; icon: typeof Trophy; tint: string }[] = [
    { label: 'LTV', amount: v.ltv, icon: Wallet, tint: 'text-sky-500' },
    { label: 'Ventas ganadas', amount: v.wonDealsValue, meta: `${v.wonDealsCount} deal${v.wonDealsCount === 1 ? '' : 's'}`, icon: Trophy, tint: 'text-emerald-500' },
    { label: 'Pipeline abierto', amount: v.openPipelineValue, meta: `${v.openDealsCount} deal${v.openDealsCount === 1 ? '' : 's'}`, icon: GitBranch, tint: 'text-violet-500' },
  ]
  if (v.ordersCount !== undefined) {
    kpis.push({
      label: 'Pedidos pagados', amount: v.ordersTotal ?? 0,
      meta: `${v.ordersCount} pedido${v.ordersCount === 1 ? '' : 's'}`, icon: ShoppingBag, tint: 'text-amber-500'
    })
  } else {
    kpis.push({
      label: 'Deals perdidos', amount: v.openPipelineValue >= 0 ? v.lostDealsCount : 0,
      meta: 'sin monto', icon: GitBranch, tint: 'text-muted-foreground'
    })
  }

  return (
    <div className="rounded-xl border bg-gradient-to-br from-emerald-500/[0.07] via-emerald-500/[0.02] to-transparent p-5">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-600/90 dark:text-emerald-400/90">
            Valor del cliente
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums leading-none">
            {formatCLP(v.capturedValue)}
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Valor real capturado{v.ordersCount !== undefined ? ' · ventas + pedidos' : ' · ventas ganadas'}
          </p>
        </div>
        <div className="rounded-lg bg-emerald-500/10 p-2.5">
          <Trophy className="h-5 w-5 text-emerald-500" />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpis.map(kpi => {
          const Icon = kpi.icon
          return (
            <div key={kpi.label} className="rounded-lg border bg-background/60 p-3">
              <div className="flex items-center gap-1.5">
                <Icon className={`h-3.5 w-3.5 ${kpi.tint}`} />
                <span className="text-[11px] text-muted-foreground truncate">{kpi.label}</span>
              </div>
              <p className="mt-1.5 text-lg font-semibold tabular-nums leading-tight">
                {kpi.label === 'Deals perdidos' ? kpi.amount : formatCLP(kpi.amount)}
              </p>
              {kpi.meta && <p className="text-[11px] text-muted-foreground">{kpi.meta}</p>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
