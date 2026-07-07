import { prisma } from '../../lib/prisma'
import { getIO } from '../../lib/socket'
import { normalizePhone } from '../../lib/phoneFormat'
import { suggestFieldMappings, qualifyLead } from './sheets.agent'

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets'
const API_KEY = process.env.GOOGLE_SHEETS_API_KEY

export function extractSheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return match ? match[1] : null
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
 * Prepares (never auto-sends) a WhatsApp conversation for a newly-qualified
 * lead: creates the Conversation if one doesn't already exist, and leaves a
 * suggested opening message as an internal note. A human reviews it in the
 * inbox and sends it manually via the existing compose flow — this never
 * dispatches anything to WhatsApp itself, avoiding the unsolicited-bulk-
 * message pattern that gets numbers banned.
 *
 * externalId is built ONLY from the lead's own formatted phone number
 * (contact.phone, already validated by normalizePhone) — this is a fresh
 * outbound-initiated contact with no prior WhatsApp message, so there is no
 * lid involved anywhere in this path.
 */
async function prepareWhatsappConversation(
  workspaceId: string,
  channelId: string,
  contact: { id: string; name: string; phone: string | null },
  openingMessageTemplate: string | null
): Promise<void> {
  if (!contact.phone) return
  const externalId = `${contact.phone}@c.us`

  const existing = await prisma.conversation.findUnique({
    where: { workspaceId_channelId_externalId: { workspaceId, channelId, externalId } }
  })
  if (existing) return

  const conversation = await prisma.conversation.create({
    data: {
      workspaceId,
      channelId,
      contactId: contact.id,
      externalId,
      status: 'PENDING',
      isHandledByBot: false
    }
  })

  const openingMessage = (openingMessageTemplate?.trim() || 'Hola {nombre}, vimos tu interés y nos encantaría ayudarte 🙌')
    .replace(/\{nombre\}/gi, contact.name)

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

  getIO().to(`workspace:${workspaceId}`).emit('conversation:new', {
    id: conversation.id,
    channelId,
    externalId,
    status: conversation.status,
    contact: { id: contact.id, name: contact.name },
    createdAt: conversation.createdAt
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
        select: { id: true }
      })
    : null

  const sessionIdCol = mappings.sessionId ? headers.indexOf(mappings.sessionId) : -1
  const eventCol = mappings.eventColumn ? headers.indexOf(mappings.eventColumn) : -1
  const eventFilter = mappings.eventFilter as string | undefined
  const nameCol = mappings.name ? headers.indexOf(mappings.name) : -1
  const emailCol = mappings.email ? headers.indexOf(mappings.email) : -1
  const phoneCol = mappings.phone ? headers.indexOf(mappings.phone) : -1
  const excludedColumns = new Set(integration.excludedColumns ?? [])
  const customFieldMappings = (integration.customFieldMappings as Record<string, string> | null) ?? {}

  let imported = 0
  let skipped = 0
  let errors = 0
  const newSessionIds: string[] = []

  for (const [rowIndex, row] of rows.entries()) {
    try {
      // Falls back to the row's position when no sessionId column is mapped
      // — sheets fed by form responses are append-only, so the row index is
      // a stable identity for dedup purposes even without an explicit ID
      // column. Without this, every sync without a sessionId mapping would
      // re-import every row from scratch.
      const sessionId = sessionIdCol >= 0 ? row[sessionIdCol] : `_row${rowIndex}`

      if (sessionId && importedIds.has(sessionId)) { skipped++; continue }

      const isComplete = !eventFilter || eventCol < 0 || row[eventCol]?.toLowerCase() === eventFilter.toLowerCase()

      const name = nameCol >= 0 ? row[nameCol]?.trim() : ''
      const email = emailCol >= 0 ? row[emailCol]?.trim() : ''
      const rawPhone = phoneCol >= 0 ? row[phoneCol]?.trim() : ''
      // Validates and normalizes to digits-only E.164 — an unparseable value
      // (typos, wrong column, garbage) becomes '' rather than being stored
      // and later used as a WhatsApp send target as-is.
      const phone = normalizePhone(rawPhone) ?? ''

      if (!name && !email && !phone) { skipped++; continue }

      const rowData: Record<string, string> = {}
      headers.forEach((h, i) => { if (!excludedColumns.has(h)) rowData[h] = row[i] ?? '' })

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

      if (!contact) {
        contact = await prisma.contact.create({
          data: {
            workspaceId: integration.workspaceId,
            name: name || `Lead ${integration.campaignLabel ?? 'Sheet'} (${sessionId?.slice(0, 8) ?? 'sin ID'})`,
            email: email || null,
            phone: phone || null,
            source: 'google_sheets',
            sourceCampaignId: integration.campaignLabel ?? null,
            status: 'LEAD',
            leadType: 'CURIOUS',
            leadTemperature: qualResult?.qualificationStatus === 'CALIFICA' ? 'HOT'
              : qualResult?.qualificationStatus === 'REVISAR' ? 'WARM' : 'COLD',
            qualificationData,
          },
        })
      }

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

      if (!existingDeal) {
        await prisma.deal.create({
          data: {
            workspaceId: integration.workspaceId,
            contactId: contact.id,
            pipelineId: integration.targetPipelineId,
            stageId: integration.targetStageId,
            title: `Lead ${integration.campaignLabel ?? integration.sheetName} - ${contact.name}`,
            value: 0,
            currency: 'CLP',
            status: 'OPEN',
          },
        })
      }

      if (whatsappChannel && phone && isComplete) {
        try {
          await prepareWhatsappConversation(integration.workspaceId, whatsappChannel.id, contact, integration.whatsappOpeningMessage)
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
