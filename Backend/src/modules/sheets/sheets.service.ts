import { prisma } from '../../lib/prisma'
import { getIO } from '../../lib/socket'
import { normalizePhone } from '../../lib/phoneFormat'
import { suggestFieldMappings, qualifyLead } from './sheets.agent'
import { sendOutboundPlatformMessage } from '../messaging/message.service'
import { sendWhatsAppTemplateMessage } from '../messaging/channels/whatsapp.service'
import { emitMetaContactEvent, emitMetaLeadEvent } from '../meta-events/metaEvents.service'

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets'
const API_KEY = process.env.GOOGLE_SHEETS_API_KEY

export function extractSheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return match ? match[1] : null
}

// Real per-row consent evidence only — a checkbox/column value the person
// actually saw and ticked, never inferred from the integration being
// configured at all (dc_events_v2_metria gate: no consent = never sent).
function isAffirmativeConsent(value: string | undefined): boolean {
  if (!value) return false
  return ['true', '1', 'si', 'sí', 'yes', 'x'].includes(value.trim().toLowerCase())
}

async function sheetsGet(path: string): Promise<any> {
  const res = await fetch(`${SHEETS_API}${path}${path.includes('?') ? '&' : '?'}key=${API_KEY}`)
  if (!res.ok) {
    const body = await res.text()
    let reason: string | undefined
    try { reason = JSON.parse(body)?.error?.status } catch { /* body wasn't JSON */ }
    // A public-API-key request to a private sheet always comes back 403
    // PERMISSION_DENIED — there is no OAuth identity behind the key, so this
    // means the sheet isn't shared "Anyone with the link", not a bad key.
    if (res.status === 403 || reason === 'PERMISSION_DENIED') {
      throw new Error('SHEET_PERMISSION_DENIED')
    }
    throw new Error(`Google Sheets API ${res.status}: ${body}`)
  }
  return res.json()
}

export async function fetchSheetMetadata(sheetId: string): Promise<{ title: string }> {
  const data = await sheetsGet(`/${sheetId}?fields=properties.title`)
  return { title: data.properties?.title ?? 'Sin nombre' }
}

export async function fetchSheetData(sheetId: string): Promise<{ headers: string[]; rows: string[][] }> {
  const data = await sheetsGet(`/${sheetId}/values/A:BZ`)
  const values: string[][] = data.values ?? []
  if (values.length === 0) return { headers: [], rows: [] }
  const headers = values[0].map((h: string) => h.trim())
  const rows = values.slice(1)
  return { headers, rows }
}

export async function analyzeSheet(url: string): Promise<{
  sheetId: string
  sheetName: string
  headers: string[]
  suggestedMappings: Awaited<ReturnType<typeof suggestFieldMappings>>
}> {
  const sheetId = extractSheetId(url)
  if (!sheetId) throw new Error('URL de planilla inválida')
  const [meta, { headers }] = await Promise.all([fetchSheetMetadata(sheetId), fetchSheetData(sheetId)])
  if (headers.length === 0) throw new Error('La planilla está vacía o no es accesible')
  const suggestedMappings = await suggestFieldMappings(headers)
  return { sheetId, sheetName: meta.title, headers, suggestedMappings }
}

/**
 * Starts a WhatsApp conversation for a newly-qualified lead: creates the
 * Conversation if one doesn't already exist, and — when the channel has the
 * AI closing agent enabled — sends the opening message immediately and hands
 * the conversation to the bot (isHandledByBot: true), so the same agent that
 * handles inbound WhatsApp leads (qualification, objection handling,
 * schedule_appointment tool) takes the lead from the first message through
 * booking the visita técnica. If the send fails (channel disconnected) or
 * the channel has no AI agent configured, it falls back to leaving the
 * suggested opener as an internal note for a human to send manually — the
 * lead is never silently dropped.
 *
 * externalId is built ONLY from the lead's own formatted phone number
 * (contact.phone, already validated by normalizePhone) — this is a fresh
 * outbound-initiated contact with no prior WhatsApp message, so there is no
 * lid involved anywhere in this path.
 */
async function prepareWhatsappConversation(
  workspaceId: string,
  channel: { id: string; config: unknown },
  contact: { id: string; name: string; phone: string | null },
  openingMessageTemplate: string | null
): Promise<void> {
  if (!contact.phone) return
  const channelId = channel.id
  const externalId = `${contact.phone}@c.us`

  const existing = await prisma.conversation.findUnique({
    where: { workspaceId_channelId_externalId: { workspaceId, channelId, externalId } }
  })
  if (existing) return

  const openingMessage = (openingMessageTemplate?.trim() || 'Hola {nombre}, vimos tu interés y nos encantaría ayudarte 🙌')
    .replace(/\{nombre\}/gi, contact.name)

  const isAiEnabled = !!(channel.config as any)?.isAiEnabled

  const conversation = await prisma.conversation.create({
    data: {
      workspaceId,
      channelId,
      contactId: contact.id,
      externalId,
      status: isAiEnabled ? 'OPEN' : 'PENDING',
      isHandledByBot: isAiEnabled
    }
  })

  getIO().to(`workspace:${workspaceId}`).emit('conversation:new', {
    id: conversation.id,
    channelId,
    externalId,
    status: conversation.status,
    contact: { id: contact.id, name: contact.name },
    createdAt: conversation.createdAt
  })

  if (isAiEnabled) {
    try {
      const config = channel.config as Record<string, any>
      const isCloudApi = !config?.isNative
      if (isCloudApi && config?.openingTemplateId) {
        await sendOpeningTemplate(workspaceId, conversation.id, channelId, config, { name: contact.name, phone: contact.phone })
      } else {
        await sendOutboundPlatformMessage(workspaceId, conversation.id, openingMessage, 'BOT')
      }
      return
    } catch (err) {
      console.error(`[SheetsSync] Failed to send opening WhatsApp message to contact ${contact.id}, falling back to manual note:`, err)
      await prisma.conversation.update({ where: { id: conversation.id }, data: { status: 'PENDING', isHandledByBot: false } })
    }
  }

  const note = await prisma.message.create({
    data: {
      workspaceId,
      conversationId: conversation.id,
      direction: 'OUTBOUND',
      senderType: 'SYSTEM',
      content: `💡 Sugerencia de primer mensaje (lead importado desde Google Sheets — revisa y envía manualmente):\n\n${openingMessage}`,
      isInternal: true
    }
  })

  getIO().to(`workspace:${workspaceId}`).emit('message:new', {
    id: note.id,
    conversationId: conversation.id,
    direction: 'OUTBOUND',
    senderType: 'SYSTEM',
    content: note.content,
    isInternal: true,
    sentAt: note.sentAt
  })
}

/**
 * Sends the workspace's configured opening HSM template to a fresh Sheets
 * lead. Cloud API rejects free-form text to a contact who has never
 * messaged the business number (error 131047) — a template is the only
 * send type allowed to open that first contact.
 */
async function sendOpeningTemplate(
  workspaceId: string,
  conversationId: string,
  channelId: string,
  config: Record<string, any>,
  contact: { name: string; phone: string }
): Promise<void> {
  const template = await prisma.whatsAppTemplate.findFirst({
    where: { id: config.openingTemplateId, channelId, status: 'APPROVED' }
  })
  if (!template) throw new Error(`Opening template ${config.openingTemplateId} not found or not APPROVED`)

  await sendWhatsAppTemplateMessage(
    config.phoneNumberId,
    config.accessToken,
    contact.phone,
    template.name,
    template.language,
    [contact.name]
  )

  const content = template.bodyText.replace(/\{\{1\}\}/g, contact.name)
  const message = await prisma.message.create({
    data: { workspaceId, conversationId, direction: 'OUTBOUND', senderType: 'BOT', content, status: 'SENT' }
  })
  getIO().to(`workspace:${workspaceId}`).emit('message:new', {
    id: message.id,
    conversationId,
    direction: 'OUTBOUND',
    senderType: 'BOT',
    content,
    sentAt: message.sentAt,
    status: 'SENT'
  })
}

// Guards against the same integration being synced twice concurrently
// (manual "sync now" click landing mid-way through the scheduled cron run) —
// without it, both runs read the same importedSessionIds snapshot and can
// both import the same rows.
const syncsInProgress = new Set<string>()

export async function syncSheet(integrationId: string): Promise<{ imported: number; skipped: number; errors: number }> {
  if (syncsInProgress.has(integrationId)) return { imported: 0, skipped: 0, errors: 0 }
  syncsInProgress.add(integrationId)
  try {
    return await runSync(integrationId)
  } finally {
    syncsInProgress.delete(integrationId)
  }
}

async function runSync(integrationId: string): Promise<{ imported: number; skipped: number; errors: number }> {
  const integration = await prisma.sheetIntegration.findUnique({ where: { id: integrationId } })
  if (!integration || !integration.isActive) return { imported: 0, skipped: 0, errors: 0 }

  const { headers, rows } = await fetchSheetData(integration.sheetId)
  if (headers.length === 0 || rows.length === 0) return { imported: 0, skipped: 0, errors: 0 }

  const mappings = integration.fieldMappings as Record<string, string>
  const qualFields = (integration.qualificationFields as string[] | null) ?? []
  const importedIds = new Set(integration.importedSessionIds)

  // Looked up once, reused per row — only relevant when the toggle is on.
  const whatsappChannel = integration.linkToWhatsapp
    ? await prisma.channel.findFirst({
        where: { workspaceId: integration.workspaceId, platform: 'WHATSAPP', status: 'CONNECTED' },
        select: { id: true, config: true }
      })
    : null

  const sessionIdCol = mappings.sessionId ? headers.indexOf(mappings.sessionId) : -1
  const consentCol = mappings.consentAccepted ? headers.indexOf(mappings.consentAccepted) : -1
  // Per-row consent text version — takes priority over integration.metaConsentVersion
  // below (QA 30jul §4 P1: auditar qué versión del texto vio esta persona
  // puntual, no sólo un valor fijo para toda la integración).
  const consentVersionCol = mappings.consentVersion ? headers.indexOf(mappings.consentVersion) : -1
  const eventCol = mappings.eventColumn ? headers.indexOf(mappings.eventColumn) : -1
  const eventFilter = mappings.eventFilter as string | undefined
  const nameCol = mappings.name ? headers.indexOf(mappings.name) : -1
  const emailCol = mappings.email ? headers.indexOf(mappings.email) : -1
  const phoneCol = mappings.phone ? headers.indexOf(mappings.phone) : -1
  // First-touch attribution columns — all optional, all only ever applied at
  // Contact creation (dc_events_v2_metria: "nunca reemplazar first_touch con
  // el último clic"). An integration with none of these mapped just imports
  // without attribution, same as before this was added.
  const ATTRIBUTION_FIELDS = [
    'utmSource', 'utmMedium', 'utmCampaign', 'utmContent', 'utmTerm',
    'metaCampaignId', 'metaAdsetId', 'metaAdId', 'fbclid', 'fbc', 'fbp',
    'landingUrl', 'referrer',
  ] as const
  type AttributionField = typeof ATTRIBUTION_FIELDS[number]
  const attributionCols = {} as Record<AttributionField, number>
  for (const field of ATTRIBUTION_FIELDS) {
    attributionCols[field] = mappings[field] ? headers.indexOf(mappings[field]) : -1
  }

  const excludedColumns = new Set(integration.excludedColumns ?? [])
  const customFieldMappings = (integration.customFieldMappings as Record<string, string> | null) ?? {}
  const qualificationKeyMappings = (integration.qualificationKeyMappings as Record<string, string> | null) ?? {}

  let imported = 0
  let skipped = 0
  let errors = 0
  const newSessionIds: string[] = []

  for (const [rowIndex, row] of rows.entries()) {
    try {
      // No row-position fallback — a spreadsheet row index is not a session
      // identity (dc_events_v2_metria spec, doc de aprobación §2.B). An
      // integration without fieldMappings.sessionId configured simply can't
      // import rows until it's mapped; that's a config gap to surface via
      // logs/soporte, not something to paper over silently.
      const sessionId: string | undefined = sessionIdCol >= 0 ? row[sessionIdCol] : undefined
      if (!sessionId) {
        skipped++
        if (sessionIdCol < 0) console.warn(`[SheetsSync] integration ${integration.id}: fieldMappings.sessionId no está configurado — fila ${rowIndex} omitida`)
        continue
      }

      if (importedIds.has(sessionId)) { skipped++; continue }

      const isComplete = !eventFilter || eventCol < 0 || row[eventCol]?.toLowerCase() === eventFilter.toLowerCase()
      // Real evidence this specific row/person consented — never inferred
      // from the integration merely having a consent version configured.
      const rowConsentGranted = consentCol >= 0 && isAffirmativeConsent(row[consentCol])
      const rowConsentVersion = consentVersionCol >= 0 ? row[consentVersionCol]?.trim() : ''

      const name = nameCol >= 0 ? row[nameCol]?.trim() : ''
      const email = emailCol >= 0 ? row[emailCol]?.trim() : ''
      const rawPhone = phoneCol >= 0 ? row[phoneCol]?.trim() : ''
      // Validates and normalizes to digits-only E.164 — an unparseable value
      // (typos, wrong column, garbage) becomes '' rather than being stored
      // and later used as a WhatsApp send target as-is.
      const phone = normalizePhone(rawPhone) ?? ''

      if (!name && !email && !phone) { skipped++; continue }

      const attribution: Partial<Record<AttributionField, string>> = {}
      for (const field of ATTRIBUTION_FIELDS) {
        const idx = attributionCols[field]
        if (idx < 0) continue
        const val = row[idx]?.trim()
        if (val) attribution[field] = val
      }

      const rowData: Record<string, string> = {}
      headers.forEach((h, i) => { if (!excludedColumns.has(h)) rowData[h] = row[i] ?? '' })

      // Resolved onto the root of qualificationData (not nested under rawFields) so
      // pendingQualificationQuestions() in promptCompiler.ts recognizes these as
      // already answered and the WhatsApp agent doesn't re-ask them.
      const resolvedQualificationAnswers: Record<string, string> = {}
      for (const [sheetCol, agentKey] of Object.entries(qualificationKeyMappings)) {
        const idx = headers.indexOf(sheetCol)
        const val = idx >= 0 ? row[idx]?.trim() : ''
        if (val) resolvedQualificationAnswers[agentKey] = val
      }

      let qualResult: Awaited<ReturnType<typeof qualifyLead>> | null = null
      if (isComplete && qualFields.length > 0) {
        qualResult = await qualifyLead(rowData, qualFields, integration.qualificationRules ?? '')
      }

      if (isComplete && integration.importFilter === 'CALIFICA_ONLY' && qualResult?.qualificationStatus !== 'CALIFICA') {
        skipped++
        if (sessionId) newSessionIds.push(sessionId)
        continue
      }
      if (isComplete && integration.importFilter === 'EXCLUDE_NO_CALIFICA' && qualResult?.qualificationStatus === 'NO_CALIFICA') {
        skipped++
        if (sessionId) newSessionIds.push(sessionId)
        continue
      }

      const qualificationData = {
        ...(qualResult ?? {}),
        ...resolvedQualificationAnswers,
        rawFields: rowData,
        importedAt: new Date().toISOString(),
        sourceSheet: integration.sheetName,
        sessionId,
      }

      let contact = email
        ? await prisma.contact.findUnique({ where: { workspaceId_email: { workspaceId: integration.workspaceId, email } } })
        : phone
          ? await prisma.contact.findUnique({ where: { workspaceId_phone: { workspaceId: integration.workspaceId, phone } } })
          : null

      let isNewContact = false
      if (!contact) {
        isNewContact = true
        contact = await prisma.contact.create({
          data: {
            workspaceId: integration.workspaceId,
            sessionId,
            name: name || `Lead ${integration.campaignLabel ?? 'Sheet'} (${sessionId.slice(0, 8)})`,
            email: email || null,
            phone: phone || null,
            source: 'google_sheets',
            sourceCampaignId: integration.campaignLabel ?? null,
            status: 'LEAD',
            leadType: 'CURIOUS',
            leadTemperature: qualResult?.qualificationStatus === 'CALIFICA' ? 'HOT'
              : qualResult?.qualificationStatus === 'REVISAR' ? 'WARM' : 'COLD',
            qualificationData,
            firstSeenAt: new Date(),
            ...attribution,
            // Consent is only stamped when this row shows real evidence of
            // consent (mapped column, affirmative value) AND the integration
            // has a consent version configured to attach — never from the
            // integration flag alone. Otherwise Contact/Lead/QualifiedLead
            // stay ungated-but-unsent (metaEvents.capi's consent check).
            ...(rowConsentGranted && (rowConsentVersion || integration.metaConsentVersion)
              ? { consentVersion: rowConsentVersion || integration.metaConsentVersion, consentAt: new Date(), consentStatus: 'granted' }
              : {}),
          },
        })
      }

      // Contact + Lead only fire for genuinely-submitted rows (isComplete) —
      // an "Incompleto"-tagged partial row isn't a confirmed business moment yet.
      if (isNewContact && isComplete) {
        emitMetaContactEvent(integration.workspaceId, contact, 'system_generated', undefined, sessionId)
          .catch(err => console.error('[SheetsSync] Contact event failed:', err))
        emitMetaLeadEvent(integration.workspaceId, contact, 'system_generated', undefined, sessionId)
          .catch(err => console.error('[SheetsSync] Lead event failed:', err))
      }

      // QualifiedLead a Meta CAPI deshabilitado (doc de aprobación §3):
      // qualResult.qualificationStatus === 'CALIFICA' por sí solo no es la
      // "regla versionada completa" que exige la spec (cobertura, propietario/
      // decisor, aptitud técnica, banda de boleta, siguiente paso confirmado,
      // + validación humana). Reactivar la llamada a emitMetaQualifiedLeadEvent
      // solo junto con esa regla real.

      const customFieldValues: Record<string, string> = {}
      for (const [sheetCol, defKey] of Object.entries(customFieldMappings)) {
        const idx = headers.indexOf(sheetCol)
        const val = idx >= 0 ? row[idx]?.trim() : ''
        if (val) customFieldValues[defKey] = val
      }
      if (Object.keys(customFieldValues).length > 0) {
        const merged = { ...((contact.customFields as Record<string, string> | null) ?? {}), ...customFieldValues }
        contact = await prisma.contact.update({ where: { id: contact.id }, data: { customFields: merged } })
      }

      if (isComplete) {
        await prisma.contactTag.deleteMany({ where: { contactId: contact.id, name: 'Incompleto' } })
      } else {
        await prisma.contactTag.upsert({
          where: { contactId_name: { contactId: contact.id, name: 'Incompleto' } },
          create: { workspaceId: integration.workspaceId, contactId: contact.id, name: 'Incompleto', color: '#f97316' },
          update: {}
        })
      }

      // Keyed on contact + pipeline only — a title substring match (e.g. on
      // the lead's name) is unreliable dedup: it can both miss real repeats
      // and false-positive across unrelated leads that share a short name.
      const existingDeal = await prisma.deal.findFirst({
        where: {
          contactId: contact.id,
          pipelineId: integration.targetPipelineId,
        },
      })

      const stageRouting = (integration.stageRouting as Record<string, string> | null) ?? {}
      const dealStageId = (qualResult && stageRouting[qualResult.qualificationStatus]) || integration.targetStageId

      if (!existingDeal) {
        await prisma.deal.create({
          data: {
            workspaceId: integration.workspaceId,
            contactId: contact.id,
            pipelineId: integration.targetPipelineId,
            stageId: dealStageId,
            title: `Lead ${integration.campaignLabel ?? integration.sheetName} - ${contact.name}`,
            value: 0,
            currency: 'CLP',
            status: 'OPEN',
          },
        })
      }

      if (whatsappChannel && phone && isComplete) {
        try {
          await prepareWhatsappConversation(integration.workspaceId, whatsappChannel, contact, integration.whatsappOpeningMessage)
        } catch (err) {
          // Never let a WhatsApp-linking failure undo the CRM import for this row.
          console.error(`[SheetsSync] Failed to prepare WhatsApp conversation for contact ${contact.id}:`, err)
        }
      }

      if (sessionId && isComplete) newSessionIds.push(sessionId)
      imported++
    } catch (err) {
      console.error(`[SheetsSync] Error en fila:`, err)
      errors++
    }
  }

  await prisma.sheetIntegration.update({
    where: { id: integrationId },
    data: {
      lastSyncedAt: new Date(),
      lastSyncError: errors > 0 ? `${errors} errores en último sync` : null,
      importedSessionIds: { push: newSessionIds },
    },
  })

  return { imported, skipped, errors }
}

export async function syncAllActiveSheets(): Promise<void> {
  const integrations = await prisma.sheetIntegration.findMany({ where: { isActive: true }, select: { id: true } })
  await Promise.allSettled(integrations.map(i => syncSheet(i.id)))
}
