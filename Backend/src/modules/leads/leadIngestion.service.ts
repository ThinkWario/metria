import type { Contact } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { normalizePhone } from '../../lib/phoneFormat'

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
