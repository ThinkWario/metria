import type { Contact, Prisma } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { normalizePhone } from '../../lib/phoneFormat'
import { normalizeRut } from '../../lib/rutFormat'
import { qualifySolarLead, evaluateSolarResV2Criteria } from './solarQualifier'
import { prepareWhatsappConversation } from './whatsappHandoff'
import { emitMetaContactEvent, emitMetaLeadEvent, emitMetaFinanceApplicationSubmittedEvent } from '../meta-events/metaEvents.service'

export const SOLAR_SOURCE = 'solar_direct'

// Tag marking a Contact created by resolveOrCreatePartialContact (`save`
// step) that never reached `finalizeLead` (`complete`) — an abandoned
// wizard session, not a real lead. contact.service.ts::listContacts
// excludes these by default so they don't inflate Total Contactos/Leads
// Activos (QA_E2E_POST_FIXES_05AGO2026.md §10.4, opción 2).
export const INCOMPLETE_LEAD_TAG = 'Incompleto'

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
  const rut = normalizeRut(payload.rut)

  if (!existing) {
    const createData = {
      workspaceId,
      source: SOLAR_SOURCE,
      sessionId: payload.sessionId,
      name: payload.nombre?.trim() || `Lead Solar (${payload.sessionId.slice(0, 8)})`,
      email: payload.email?.trim() || null,
      phone: phone || null,
      status: 'LEAD',
      qualificationData: { rawFields: payload as Prisma.InputJsonValue },
      ...extractAttributionFields(payload),
      tags: { create: { workspaceId, name: INCOMPLETE_LEAD_TAG, color: '#f97316' } }
    }
    try {
      return await prisma.contact.create({ data: { ...createData, rut: rut || null } })
    } catch (err: any) {
      // `save` fires on every wizard step (~10x/session) as a best-effort
      // autosave — it is NOT the identity-conflict gate (that's finalizeLead,
      // 'complete' path). A restarted/abandoned session re-entering a RUT
      // that already belongs to another Contact must not 500 a routine
      // autosave; drop the rut here and let `complete` surface the real 409.
      if (err?.code === 'P2002' && rut) {
        return prisma.contact.create({ data: createData })
      }
      throw err
    }
  }

  const existingQualificationData = (existing.qualificationData as object) ?? {}
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

  const updateData = {
    ...(payload.nombre?.trim() ? { name: payload.nombre.trim() } : {}),
    ...(payload.email?.trim() ? { email: payload.email.trim() } : {}),
    ...(phone ? { phone } : {}),
    qualificationData: { ...existingQualificationData, rawFields: mergedRawFields as Prisma.InputJsonValue },
    ...attributionUpdate
  }
  try {
    return await prisma.contact.update({ where: { id: existing.id }, data: { ...updateData, ...(rut ? { rut } : {}) } })
  } catch (err: any) {
    // Same rationale as the create branch above — don't 500 a routine
    // autosave because this session's RUT now matches a different Contact.
    if (err?.code === 'P2002' && rut) {
      return prisma.contact.update({ where: { id: existing.id }, data: updateData })
    }
    throw err
  }
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
  // Machine-readable discriminator for the 409 identity-conflict case — the
  // Spanish `error` string is for humans/logs, `code` is what a caller (the
  // solar wizard, or any future consumer) should branch on
  // (QA_CORROBORACION_DESARROLLADOR_05AGO2026.md §5 correction #2: "responder
  // con un resultado estructurado, por ejemplo 409 IdentityConflict").
  code?: 'IDENTITY_CONFLICT'
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
  if (!payload.consentVersion?.trim()) {
    return { ok: false, status: 422, error: 'consentVersion es requerido para completar el lead' }
  }

  const bySession = await findContactBySession(workspaceId, payload.sessionId)
  const email = payload.email?.trim() || null
  const phone = payload.telefono ? normalizePhone(payload.telefono) : null
  const rut = normalizeRut(payload.rut)

  const byEmail = email
    ? await prisma.contact.findUnique({ where: { workspaceId_email: { workspaceId, email } } })
    : null
  const byPhone = phone
    ? await prisma.contact.findUnique({ where: { workspaceId_phone: { workspaceId, phone } } })
    : null
  // A RUT reused under a brand-new email/phone is still the same identity
  // colliding — without this check that case created a second, disconnected
  // Contact instead of surfacing the collision
  // (QA_CORROBORACION_DESARROLLADOR_05AGO2026.md §3: "El caso reutilizó un
  // RUT existente con email y teléfono nuevos" while the UI showed success).
  const byRut = rut
    ? await prisma.contact.findUnique({ where: { workspaceId_rut: { workspaceId, rut } } })
    : null

  const conflicting = [byEmail, byPhone, byRut].find(c => c && c.id !== bySession?.id)
  if (conflicting) {
    return {
      ok: false, status: 409, code: 'IDENTITY_CONFLICT',
      error: `El email/teléfono/RUT de este lead ya pertenece a otro contacto (${conflicting.id}) — requiere resolución manual`
    }
  }

  const existingRawFields = bySession ? ((bySession.qualificationData as any)?.rawFields ?? {}) : {}
  const mergedRawFields = { ...existingRawFields, ...payload }

  // Computed BEFORE writing the Contact so qualificationStatus/leadTemperature
  // land in the same create/update call — the Contact profile (Task 9) reads
  // qualificationData.qualificationStatus + qualificationSummary directly,
  // never re-derives them, so they must be persisted, not just computed.
  const qualResult = qualifySolarLead(mergedRawFields)
  const solarResV2Criteria = evaluateSolarResV2Criteria(mergedRawFields)
  const leadTemperature = qualResult.qualificationStatus === 'CALIFICA' ? 'HOT'
    : qualResult.qualificationStatus === 'REVISAR' ? 'WARM' : 'COLD'
  // Spreadea qualificationData existente ANTES de las claves nuevas — un
  // segundo `complete` idempotente para el mismo sessionId no debe borrar
  // qualifiedLeadConfirmedBy/At/qualificationVersion/nextStepConfirmed que
  // confirmQualifiedLead (contact.service.ts) ya haya escrito.
  const existingQualificationData = (bySession?.qualificationData as object) ?? {}
  const qualificationData = {
    ...existingQualificationData,
    rawFields: mergedRawFields,
    qualificationStatus: qualResult.qualificationStatus,
    qualificationSummary: qualResult.qualificationSummary,
    solarResV2Criteria: solarResV2Criteria as unknown as Prisma.InputJsonValue
  }

  // Consent evidence is immutable once granted — a retried `complete` (e.g.
  // the financing form re-invoking completeLead for the same session) is
  // not a new acceptance and must not shift consentAt or replace the
  // version the user actually agreed to
  // (QA_E2E_INDEPENDIENTE_POST_MD_05AGO2026.md P1: "un reenvío financiero
  // no constituye una nueva aceptación").
  const alreadyConsented = bySession?.consentStatus === 'granted' && !!bySession.consentAt

  // The byEmail/byPhone/byRut reads above and this write are not
  // transactional — two sessions racing to `complete` with the same
  // brand-new email/phone/RUT can both pass the pre-check before either
  // row exists. Catching P2002 here turns that race into the same
  // structured 409 instead of an uncaught unique-violation bubbling up as
  // a generic 500.
  let contact: Contact
  try {
    contact = bySession
    ? await prisma.contact.update({
        where: { id: bySession.id },
        data: {
          ...(payload.nombre?.trim() ? { name: payload.nombre.trim() } : {}),
          ...(email ? { email } : {}),
          ...(phone ? { phone } : {}),
          ...(rut ? { rut } : {}),
          qualificationData,
          leadTemperature,
          consentVersion: alreadyConsented ? bySession.consentVersion : (payload.consentVersion ?? null),
          consentAt: alreadyConsented ? bySession.consentAt : new Date(),
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
          email, phone, rut,
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
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return {
        ok: false, status: 409, code: 'IDENTITY_CONFLICT',
        error: 'El email/teléfono/RUT de este lead ya pertenece a otro contacto — requiere resolución manual'
      }
    }
    throw err
  }

  await prisma.contactTag.deleteMany({ where: { contactId: contact.id, name: INCOMPLETE_LEAD_TAG } })

  // Guarded like the Meta CAPI calls below: the Contact (the actual lead —
  // identity, consent, attribution, qualification) is already durably
  // persisted above. A misconfigured SOLAR_PIPELINE_ID/SOLAR_STAGE_ID or a
  // transient DB error here must not turn into a 500 that makes the wizard
  // tell the user their submission failed when it didn't
  // (QA_E2E_POST_FIXES_05AGO2026.md §7 P0: "el fallo o demora ... no debe
  // hacer perder el lead ni dejar al usuario bloqueado"). A retried
  // `complete` for the same session will find `contact` via `bySession`
  // and simply try the Deal again — no duplicate risk.
  try {
    const existingDeal = await prisma.deal.findFirst({ where: { contactId: contact.id, pipelineId: SOLAR_PIPELINE_ID } })
    if (!existingDeal) {
      await prisma.deal.create({
        data: {
          workspaceId, contactId: contact.id, pipelineId: SOLAR_PIPELINE_ID, stageId: SOLAR_STAGE_ID,
          title: `Lead Solar - ${contact.name}`, value: 0, currency: 'CLP', status: 'OPEN'
        }
      })
    }
  } catch (err) {
    console.error(`[LeadIngestion] Deal creation failed for contact ${contact.id} (SOLAR_PIPELINE_ID/SOLAR_STAGE_ID misconfigured?):`, err)
  }

  // Contact/Lead/FinanceApplicationSubmitted se originan directamente en el
  // wizard de solar.drillchile.cl — action_source='website'
  // (INSTRUCCIONES_DESARROLLADOR_TRACKING_METRIA_SOLAR_AGOSTO_2026.md §12),
  // no 'system_generated'. Solo se disparan si hay identidad verificable
  // (aprobación dev3007 §2.G: "Contact solo si teléfono/email válido") —
  // enviar user_data casi vacío a Meta no cumple esa exigencia.
  const hasValidIdentity = !!(contact.email || contact.phone)
  if (hasValidIdentity) {
    // Awaited (not fire-and-forget) — the outbox row must exist before this
    // function returns, so a process restart right after the HTTP response
    // can't silently drop an event that was never persisted.
    try {
      await emitMetaContactEvent(workspaceId, contact, 'website', undefined, payload.sessionId, payload.landingUrl)
    } catch (err) {
      console.error('[LeadIngestion] Contact event failed:', err)
    }
    try {
      await emitMetaLeadEvent(workspaceId, contact, 'website', undefined, payload.sessionId, payload.landingUrl)
    } catch (err) {
      console.error('[LeadIngestion] Lead event failed:', err)
    }

    if (isFinancingApplication(payload)) {
      try {
        await emitMetaFinanceApplicationSubmittedEvent(workspaceId, contact, 'website', payload.sessionId, payload.landingUrl)
      } catch (err) {
        console.error('[LeadIngestion] FinanceApplicationSubmitted event failed:', err)
      }
    }
  } else {
    console.warn(`[LeadIngestion] Skipping Meta CAPI for contact ${contact.id}: no valid email/phone`)
  }

  // QualifiedLead a Meta CAPI: NO se dispara automáticamente aquí. dev3007
  // (ESPECIFICACION_CONSOLIDADA_TRACKING_METRIA_SOLAR.md v1.1 §3,
  // RESPUESTA_DESARROLLADOR_APROBADO_CON_CORRECCIONES.md §QualifiedLead)
  // exige la regla completa solar_res_v2 (los 4 criterios de
  // qualificationData.solarResV2Criteria) MÁS validación humana autorizada
  // antes de emitir — qualResult.qualificationStatus==='CALIFICA' por sí
  // solo no basta, mismo criterio ya aplicado en
  // contact.service.ts:227-229 y sheets.service.ts. La emisión real ocurre
  // en contact.service.ts::confirmQualifiedLead (Task 6) cuando un humano
  // confirma desde el Contact profile.

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
