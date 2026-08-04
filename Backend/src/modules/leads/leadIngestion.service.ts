import type { Contact } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { normalizePhone } from '../../lib/phoneFormat'
import { qualifySolarLead } from './solarQualifier'
import { prepareWhatsappConversation } from './whatsappHandoff'
import { emitMetaContactEvent, emitMetaLeadEvent, emitMetaFinanceApplicationSubmittedEvent, emitMetaQualifiedLeadEvent } from '../meta-events/metaEvents.service'

export const SOLAR_SOURCE = 'solar_direct'

/**
 * Field names match solar's actual `StepData` shape verbatim
 * (`C:\repo\drillchile\solar\src\lib\types.ts`) — solar spreads
 * `...stepData`/`...finalData` directly into the POST body (`actions.ts`,
 * Task 8), so the wire format is `nombre`/`telefono`/`rut`, NOT `name`/
 * `phone`. Do not rename these to English without also changing Task 8.
 * `Contact.name`/`Contact.phone` (the Prisma columns) keep their own
 * names — this interface only describes what arrives on the wire.
 */
export interface SolarLeadPayload {
  sessionId: string
  nombre?: string
  email?: string
  telefono?: string
  rut?: string
  consentAccepted?: boolean
  consentVersion?: string
  metaFbc?: string
  metaFbp?: string
  clientIpAddress?: string
  clientUserAgent?: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmContent?: string
  utmTerm?: string
  fbclid?: string
  metaCampaignId?: string
  metaAdsetId?: string
  metaAdId?: string
  landingUrl?: string
  referrer?: string
  [key: string]: unknown
}

const ATTRIBUTION_FIELDS = [
  'utmSource', 'utmMedium', 'utmCampaign', 'utmContent', 'utmTerm',
  'metaCampaignId', 'metaAdsetId', 'metaAdId', 'fbclid', 'landingUrl', 'referrer'
] as const

/**
 * First-touch attribution scalars (dc_events_v1 spec: "nunca reemplazar
 * first_touch con el último clic", schema.prisma:434-436) — parity with the
 * `attribution` object sheets.service.ts:270-329 already builds for the
 * Sheets pipeline. Without this, Contact.utmSource/metaCampaignId/etc. stay
 * NULL forever for every solar_direct lead — the data lands in
 * qualificationData.rawFields but is unusable for campaign-level reporting
 * (no SQL WHERE, no Task 9 card, since both read the scalar columns).
 */
function extractAttributionFields(payload: SolarLeadPayload): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const key of ATTRIBUTION_FIELDS) {
    const value = payload[key]
    if (typeof value === 'string' && value.trim()) fields[key] = value.trim()
  }
  return fields
}

function findContactBySession(workspaceId: string, sessionId: string) {
  return prisma.contact.findUnique({
    where: { workspaceId_source_sessionId: { workspaceId, source: SOLAR_SOURCE, sessionId } }
  })
}

/**
 * `save` path: called once per wizard step. Creates the partial Contact on
 * first call (tagged Incompleto) — first-touch attribution is captured here
 * since solar's very first `save` already carries it (`StepData` captures
 * attribution once from the URL on first load, types.ts:55-57) — and merges
 * new fields into qualificationData.rawFields on every subsequent call for
 * the same sessionId — sheets.service.ts never had this merge behavior (it
 * only ever creates once per sessionId), this is genuinely new logic.
 */
export async function resolveOrCreatePartialContact(
  workspaceId: string,
  payload: SolarLeadPayload
): Promise<Contact> {
  const existing = await findContactBySession(workspaceId, payload.sessionId)
  const phone = payload.telefono ? normalizePhone(payload.telefono) : null

  if (!existing) {
    return prisma.contact.create({
      data: {
        workspaceId,
        source: SOLAR_SOURCE,
        sessionId: payload.sessionId,
        name: payload.nombre?.trim() || `Lead Solar (${payload.sessionId.slice(0, 8)})`,
        email: payload.email?.trim() || null,
        phone: phone || null,
        status: 'LEAD',
        qualificationData: { rawFields: payload },
        ...extractAttributionFields(payload),
        tags: { create: { workspaceId, name: 'Incompleto', color: '#f97316' } }
      }
    })
  }

  const existingRawFields = ((existing.qualificationData as any)?.rawFields ?? {}) as Record<string, unknown>
  const incomingFields = Object.fromEntries(
    Object.entries(payload).filter(([, v]) => v !== undefined && v !== '')
  )
  const mergedRawFields = { ...existingRawFields, ...incomingFields }

  // First-touch: only fill attribution scalars still null on the existing
  // row — never overwrite the value captured on the session's first `save`.
  const attributionUpdate = Object.fromEntries(
    Object.entries(extractAttributionFields(payload)).filter(([key]) => !(existing as any)[key])
  )

  return prisma.contact.update({
    where: { id: existing.id },
    data: {
      ...(payload.nombre?.trim() ? { name: payload.nombre.trim() } : {}),
      ...(payload.email?.trim() ? { email: payload.email.trim() } : {}),
      ...(phone ? { phone } : {}),
      qualificationData: { rawFields: mergedRawFields },
      ...attributionUpdate
    }
  })
}

const SOLAR_PIPELINE_ID = process.env.SOLAR_PIPELINE_ID ?? ''
const SOLAR_STAGE_ID = process.env.SOLAR_STAGE_ID ?? ''

const FINANCING_FIELDS = ['edad', 'estadoCivil', 'valorCasa', 'deudaCasa', 'ingresoMensual', 'profesion', 'deudaContribuciones', 'embargoVigente']

function isFinancingApplication(payload: SolarLeadPayload): boolean {
  return FINANCING_FIELDS.some(f => {
    const v = payload[f]
    return typeof v === 'string' && v.trim().length > 0
  })
}

export interface FinalizeLeadResult {
  ok: boolean
  status?: number
  error?: string
  contact?: Contact
}

/**
 * `complete` path — the wizard's submit moment. Re-validates consent
 * server-side (never trusts the client's own 422 gate), resolves the
 * session's partial Contact (or creates one if `complete` arrives without a
 * prior `save`), detects a genuine identity conflict (the email/phone now
 * known belongs to a DIFFERENT existing Contact than the one tied to this
 * sessionId), qualifies, ensures a Deal, and fires Meta CAPI + WhatsApp
 * handoff. CAPI calls are safe to make even on a retried `complete` —
 * emitConversionEvent dedupes on (pixelId, eventName, eventId) at the DB
 * level (metaEvents.capi.ts), so no extra idempotency guard is needed here.
 */
export async function finalizeLead(
  workspaceId: string,
  payload: SolarLeadPayload
): Promise<FinalizeLeadResult> {
  if (payload.consentAccepted !== true) {
    return { ok: false, status: 422, error: 'consentAccepted es requerido para completar el lead' }
  }

  const bySession = await findContactBySession(workspaceId, payload.sessionId)
  const email = payload.email?.trim() || null
  const phone = payload.telefono ? normalizePhone(payload.telefono) : null

  const byEmail = email
    ? await prisma.contact.findUnique({ where: { workspaceId_email: { workspaceId, email } } })
    : null
  const byPhone = phone
    ? await prisma.contact.findUnique({ where: { workspaceId_phone: { workspaceId, phone } } })
    : null

  const conflicting = [byEmail, byPhone].find(c => c && c.id !== bySession?.id)
  if (conflicting) {
    return {
      ok: false, status: 409,
      error: `El email/teléfono de este lead ya pertenece a otro contacto (${conflicting.id}) — requiere resolución manual`
    }
  }

  const existingRawFields = bySession ? ((bySession.qualificationData as any)?.rawFields ?? {}) : {}
  const mergedRawFields = { ...existingRawFields, ...payload }

  // Computed BEFORE writing the Contact so qualificationStatus/leadTemperature
  // land in the same create/update call — the Contact profile (Task 9) reads
  // qualificationData.qualificationStatus + qualificationSummary directly,
  // never re-derives them, so they must be persisted, not just computed.
  const qualResult = qualifySolarLead(mergedRawFields)
  const leadTemperature = qualResult.qualificationStatus === 'CALIFICA' ? 'HOT'
    : qualResult.qualificationStatus === 'REVISAR' ? 'WARM' : 'COLD'
  const qualificationData = {
    rawFields: mergedRawFields,
    qualificationStatus: qualResult.qualificationStatus,
    qualificationSummary: qualResult.qualificationSummary
  }

  const contact = bySession
    ? await prisma.contact.update({
        where: { id: bySession.id },
        data: {
          ...(payload.nombre?.trim() ? { name: payload.nombre.trim() } : {}),
          ...(email ? { email } : {}),
          ...(phone ? { phone } : {}),
          qualificationData,
          leadTemperature,
          consentVersion: payload.consentVersion ?? null,
          consentAt: new Date(),
          consentStatus: 'granted',
          ...(payload.metaFbc ? { fbc: payload.metaFbc } : {}),
          ...(payload.metaFbp ? { fbp: payload.metaFbp } : {}),
          ...(payload.clientIpAddress ? { clientIpAddress: payload.clientIpAddress } : {}),
          ...(payload.clientUserAgent ? { clientUserAgent: payload.clientUserAgent } : {}),
          // First-touch: solo llena lo que el Contact todavía no tenía (puede
          // venir seteado desde el primer `save`, Task 3) — paridad con el
          // objeto `attribution` que sheets.service.ts:270-329 ya escribe.
          // Sin esto, utm*/meta*Id/fbclid/landingUrl/referrer quedan atrapados
          // en qualificationData.rawFields — inútiles para reporting y para
          // la card "Atribución / Meta Ads" (Task 9), que lee los escalares.
          ...Object.fromEntries(
            Object.entries(extractAttributionFields(payload)).filter(([key]) => !(bySession as any)[key])
          )
        }
      })
    : await prisma.contact.create({
        data: {
          workspaceId,
          source: SOLAR_SOURCE,
          sessionId: payload.sessionId,
          name: payload.nombre?.trim() || `Lead Solar (${payload.sessionId.slice(0, 8)})`,
          email, phone,
          status: 'LEAD',
          qualificationData,
          leadTemperature,
          consentVersion: payload.consentVersion ?? null,
          consentAt: new Date(),
          consentStatus: 'granted',
          fbc: payload.metaFbc ?? null,
          fbp: payload.metaFbp ?? null,
          clientIpAddress: payload.clientIpAddress ?? null,
          clientUserAgent: payload.clientUserAgent ?? null,
          ...extractAttributionFields(payload)
        }
      })

  await prisma.contactTag.deleteMany({ where: { contactId: contact.id, name: 'Incompleto' } })

  const existingDeal = await prisma.deal.findFirst({ where: { contactId: contact.id, pipelineId: SOLAR_PIPELINE_ID } })
  if (!existingDeal) {
    await prisma.deal.create({
      data: {
        workspaceId, contactId: contact.id, pipelineId: SOLAR_PIPELINE_ID, stageId: SOLAR_STAGE_ID,
        title: `Lead Solar - ${contact.name}`, value: 0, currency: 'CLP', status: 'OPEN'
      }
    })
  }

  emitMetaContactEvent(workspaceId, contact, 'system_generated', undefined, payload.sessionId)
    .catch(err => console.error('[LeadIngestion] Contact event failed:', err))
  emitMetaLeadEvent(workspaceId, contact, 'system_generated', undefined, payload.sessionId)
    .catch(err => console.error('[LeadIngestion] Lead event failed:', err))

  if (isFinancingApplication(payload)) {
    emitMetaFinanceApplicationSubmittedEvent(workspaceId, contact, 'system_generated', payload.sessionId)
      .catch(err => console.error('[LeadIngestion] FinanceApplicationSubmitted event failed:', err))
  }

  if (qualResult.qualificationStatus === 'CALIFICA') {
    emitMetaQualifiedLeadEvent(workspaceId, contact, 'system_generated', { qualificationVersion: 'solar-v1' })
      .catch(err => console.error('[LeadIngestion] QualifiedLead event failed:', err))
  }

  if (phone) {
    const whatsappChannel = await prisma.channel.findFirst({
      where: { workspaceId, platform: 'WHATSAPP', status: 'CONNECTED' },
      select: { id: true, config: true }
    })
    if (whatsappChannel) {
      try {
        await prepareWhatsappConversation(workspaceId, whatsappChannel, contact, null)
      } catch (err) {
        console.error(`[LeadIngestion] Failed to prepare WhatsApp conversation for contact ${contact.id}:`, err)
      }
    }
  }

  return { ok: true, contact }
}
