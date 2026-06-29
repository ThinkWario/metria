import { prisma } from '../../lib/prisma'
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

export async function syncSheet(integrationId: string): Promise<{ imported: number; skipped: number; errors: number }> {
  const integration = await prisma.sheetIntegration.findUnique({ where: { id: integrationId } })
  if (!integration || !integration.isActive) return { imported: 0, skipped: 0, errors: 0 }

  const { headers, rows } = await fetchSheetData(integration.sheetId)
  if (headers.length === 0 || rows.length === 0) return { imported: 0, skipped: 0, errors: 0 }

  const mappings = integration.fieldMappings as Record<string, string>
  const qualFields = (integration.qualificationFields as string[] | null) ?? []
  const importedIds = new Set(integration.importedSessionIds)

  const sessionIdCol = mappings.sessionId ? headers.indexOf(mappings.sessionId) : -1
  const eventCol = mappings.eventColumn ? headers.indexOf(mappings.eventColumn) : -1
  const eventFilter = mappings.eventFilter as string | undefined
  const nameCol = mappings.name ? headers.indexOf(mappings.name) : -1
  const emailCol = mappings.email ? headers.indexOf(mappings.email) : -1
  const phoneCol = mappings.phone ? headers.indexOf(mappings.phone) : -1

  let imported = 0
  let skipped = 0
  let errors = 0
  const newSessionIds: string[] = []

  for (const row of rows) {
    try {
      const sessionId = sessionIdCol >= 0 ? row[sessionIdCol] : null

      if (sessionId && importedIds.has(sessionId)) { skipped++; continue }

      if (eventFilter && eventCol >= 0 && row[eventCol]?.toLowerCase() !== eventFilter.toLowerCase()) {
        skipped++
        continue
      }

      const name = nameCol >= 0 ? row[nameCol]?.trim() : ''
      const email = emailCol >= 0 ? row[emailCol]?.trim() : ''
      const phone = phoneCol >= 0 ? row[phoneCol]?.trim() : ''

      if (!name && !email && !phone) { skipped++; continue }

      const rowData: Record<string, string> = {}
      headers.forEach((h, i) => { rowData[h] = row[i] ?? '' })

      let qualResult: Awaited<ReturnType<typeof qualifyLead>> | null = null
      if (qualFields.length > 0) {
        qualResult = await qualifyLead(rowData, qualFields, integration.qualificationRules ?? '')
      }

      if (integration.importFilter === 'CALIFICA_ONLY' && qualResult?.qualificationStatus !== 'CALIFICA') {
        skipped++
        if (sessionId) newSessionIds.push(sessionId)
        continue
      }
      if (integration.importFilter === 'EXCLUDE_NO_CALIFICA' && qualResult?.qualificationStatus === 'NO_CALIFICA') {
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

      const existingDeal = await prisma.deal.findFirst({
        where: {
          contactId: contact.id,
          pipelineId: integration.targetPipelineId,
          title: { contains: sessionId?.slice(0, 8) ?? contact.name },
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

      if (sessionId) newSessionIds.push(sessionId)
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
