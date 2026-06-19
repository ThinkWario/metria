import { prisma } from '../../lib/prisma'
import { getSegmentContacts } from '../crm/segments.service'
import { getDriver, dispatch, type Channel } from './drivers'

// ── Types ────────────────────────────────────────────────────────────────────

export type CampaignChannel = Channel // 'EMAIL' | 'SMS' | 'WHATSAPP'

export interface CampaignStats {
  total: number
  sent: number
  failed: number
}

interface CreateCampaignInput {
  name: string
  channel: CampaignChannel
  subject?: string | null
  body: string
  segmentId?: string | null
  scheduledAt?: string | null
}

interface UpdateCampaignInput {
  name?: string
  channel?: CampaignChannel
  subject?: string | null
  body?: string
  segmentId?: string | null
  scheduledAt?: string | null
}

const VALID_CHANNELS: CampaignChannel[] = ['EMAIL', 'SMS', 'WHATSAPP']
const DELETABLE_STATUSES = ['DRAFT', 'SCHEDULED']
const SEND_PAGE_SIZE = 100

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Render {{name}} / {{phone}} / {{email}} merge tags from a contact. Unknown
 * tags are left as-is so a typo is visible rather than silently dropped.
 */
function renderMergeTags(
  template: string,
  contact: { name: string | null; phone: string | null; email: string | null }
): string {
  return template.replace(/\{\{\s*(name|phone|email)\s*\}\}/gi, (_match, key: string) => {
    const k = key.toLowerCase()
    if (k === 'name') return contact.name ?? ''
    if (k === 'phone') return contact.phone ?? ''
    if (k === 'email') return contact.email ?? ''
    return _match
  })
}

/** The contact field used as the destination address for a channel. */
function recipientAddress(
  channel: CampaignChannel,
  contact: { email: string | null; phone: string | null }
): string | null {
  return channel === 'EMAIL' ? contact.email : contact.phone
}

/** The Suppression channel key for a campaign channel (WhatsApp suppresses by phone too). */
function suppressionChannel(channel: CampaignChannel): string {
  return channel === 'EMAIL' ? 'EMAIL' : 'SMS'
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function listCampaigns(workspaceId: string) {
  const campaigns = await prisma.campaign.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { recipients: true } } },
  })

  // Surface a sent count so the list can show "x/y enviados" without N queries.
  const sentCounts = await prisma.campaignRecipient.groupBy({
    by: ['campaignId'],
    where: { workspaceId, status: 'SENT' },
    _count: { _all: true },
  })
  const sentByCampaign = new Map(sentCounts.map((s) => [s.campaignId, s._count._all]))

  return campaigns.map((c) => ({
    ...c,
    recipientCount: c._count.recipients,
    sentCount: sentByCampaign.get(c.id) ?? 0,
  }))
}

export async function getCampaign(workspaceId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, workspaceId },
  })
  if (!campaign) throw new Error('Campaign not found')

  // Per-status recipient breakdown for the detail/stats view.
  const grouped = await prisma.campaignRecipient.groupBy({
    by: ['status'],
    where: { campaignId, workspaceId },
    _count: { _all: true },
  })
  const recipientStats: Record<string, number> = {}
  let recipientCount = 0
  for (const g of grouped) {
    recipientStats[g.status] = g._count._all
    recipientCount += g._count._all
  }

  let segment: { id: string; name: string } | null = null
  if (campaign.segmentId) {
    const s = await prisma.segment.findFirst({
      where: { id: campaign.segmentId, workspaceId },
      select: { id: true, name: true },
    })
    segment = s ?? null
  }

  return { ...campaign, recipientStats, recipientCount, segment }
}

export async function createCampaign(workspaceId: string, input: CreateCampaignInput) {
  if (!input.name?.trim()) throw new Error('name is required')
  if (!VALID_CHANNELS.includes(input.channel)) throw new Error('invalid channel')
  if (!input.body?.trim()) throw new Error('body is required')

  return prisma.campaign.create({
    data: {
      workspaceId,
      name: input.name.trim(),
      channel: input.channel,
      subject: input.channel === 'EMAIL' ? input.subject?.trim() || null : null,
      body: input.body,
      segmentId: input.segmentId || null,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      status: input.scheduledAt ? 'SCHEDULED' : 'DRAFT',
    },
  })
}

export async function updateCampaign(
  workspaceId: string,
  campaignId: string,
  input: UpdateCampaignInput
) {
  const existing = await prisma.campaign.findFirst({
    where: { id: campaignId, workspaceId },
  })
  if (!existing) throw new Error('Campaign not found')
  if (!DELETABLE_STATUSES.includes(existing.status)) {
    throw new Error('Only DRAFT or SCHEDULED campaigns can be edited')
  }

  if (input.channel !== undefined && !VALID_CHANNELS.includes(input.channel)) {
    throw new Error('invalid channel')
  }

  const nextChannel = input.channel ?? (existing.channel as CampaignChannel)

  return prisma.campaign.update({
    where: { id: campaignId },
    data: {
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.channel !== undefined && { channel: input.channel }),
      // Subject only meaningful for EMAIL; clear it otherwise.
      ...(input.subject !== undefined || input.channel !== undefined
        ? { subject: nextChannel === 'EMAIL' ? input.subject?.trim() || null : null }
        : {}),
      ...(input.body !== undefined && { body: input.body }),
      ...(input.segmentId !== undefined && { segmentId: input.segmentId || null }),
      ...(input.scheduledAt !== undefined && {
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        status: input.scheduledAt ? 'SCHEDULED' : 'DRAFT',
      }),
    },
  })
}

export async function deleteCampaign(workspaceId: string, campaignId: string) {
  const existing = await prisma.campaign.findFirst({
    where: { id: campaignId, workspaceId },
  })
  if (!existing) throw new Error('Campaign not found')
  if (!DELETABLE_STATUSES.includes(existing.status)) {
    throw new Error('Only DRAFT or SCHEDULED campaigns can be deleted')
  }
  return prisma.campaign.delete({ where: { id: campaignId } })
}

export async function duplicateCampaign(workspaceId: string, campaignId: string) {
  const original = await prisma.campaign.findFirst({ where: { id: campaignId, workspaceId } })
  if (!original) throw new Error('Campaign not found')
  return prisma.campaign.create({
    data: {
      workspaceId,
      name: `Copia de ${original.name}`,
      channel: original.channel,
      subject: original.subject,
      body: original.body,
      segmentId: original.segmentId,
      status: 'DRAFT',
    }
  })
}

// ── Audience preview ───────────────────────────────────────────────────────────

export async function previewAudience(workspaceId: string, segmentId: string) {
  if (!segmentId) throw new Error('segmentId is required')
  // Page 1 with size 1 — we only need the `total` the service returns.
  const { total } = await getSegmentContacts(workspaceId, segmentId, 1, 1)
  return { count: total }
}

// ── Send engine ─────────────────────────────────────────────────────────────

/**
 * Send a campaign to every contact in its segment.
 *
 * Resilient by design: each recipient is processed independently, one failure
 * never aborts the batch, and suppressed / address-less contacts are skipped
 * (counted as failed with a reason). Aggregates {total,sent,failed} into the
 * campaign's stats and marks it SENT.
 */
export async function sendCampaign(workspaceId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, workspaceId },
  })
  if (!campaign) throw new Error('Campaign not found')

  // ── Guards ──
  if (!DELETABLE_STATUSES.includes(campaign.status)) {
    throw new Error('Only DRAFT or SCHEDULED campaigns can be sent')
  }
  if (!campaign.segmentId) throw new Error('Campaign has no audience segment')
  if (!campaign.body?.trim()) throw new Error('Campaign has no message body')

  const channel = campaign.channel as CampaignChannel
  const driver = getDriver(channel)
  const supChannel = suppressionChannel(channel)

  // Mark as SENDING so concurrent send attempts are rejected by the guard above.
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: 'SENDING' },
  })

  // Load the workspace suppression list for this channel once.
  const suppressions = await prisma.suppression.findMany({
    where: { workspaceId, channel: supChannel },
    select: { value: true },
  })
  const suppressed = new Set(suppressions.map((s) => s.value.toLowerCase()))

  const stats: CampaignStats = { total: 0, sent: 0, failed: 0 }

  try {
    // Paginate through ALL segment contacts.
    let page = 1
    let totalPages = 1

    do {
      const result = await getSegmentContacts(workspaceId, campaign.segmentId, page, SEND_PAGE_SIZE)
      totalPages = result.totalPages

      for (const contact of result.contacts) {
        stats.total++
        const address = recipientAddress(channel, contact as any)

        // Skip: no usable destination address for this channel.
        if (!address) {
          stats.failed++
          await prisma.campaignRecipient.create({
            data: {
              campaignId,
              workspaceId,
              contactId: contact.id,
              status: 'FAILED',
              error: channel === 'EMAIL' ? 'Contacto sin email' : 'Contacto sin teléfono',
            },
          })
          continue
        }

        // Skip: contact is on the do-not-contact list.
        if (suppressed.has(address.toLowerCase())) {
          stats.failed++
          await prisma.campaignRecipient.create({
            data: {
              campaignId,
              workspaceId,
              contactId: contact.id,
              status: 'UNSUBSCRIBED',
              error: 'En lista de exclusión',
            },
          })
          continue
        }

        // Render merge tags and dispatch.
        const body = renderMergeTags(campaign.body, contact as any)
        const subject = campaign.subject ? renderMergeTags(campaign.subject, contact as any) : ''

        let result_: { ok: boolean; error?: string }
        try {
          result_ = await dispatch(driver, channel, address, subject, body)
        } catch (err: any) {
          // Drivers shouldn't throw, but stay defensive regardless.
          result_ = { ok: false, error: err?.message ?? 'Error de envío' }
        }

        if (result_.ok) {
          stats.sent++
          await prisma.campaignRecipient.create({
            data: {
              campaignId,
              workspaceId,
              contactId: contact.id,
              status: 'SENT',
              sentAt: new Date(),
            },
          })
        } else {
          stats.failed++
          await prisma.campaignRecipient.create({
            data: {
              campaignId,
              workspaceId,
              contactId: contact.id,
              status: 'FAILED',
              error: result_.error ?? 'Error de envío',
            },
          })
        }
      }

      page++
    } while (page <= totalPages)

    const updated = await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'SENT', sentAt: new Date(), stats: stats as any },
    })
    return { ...updated, stats }
  } catch (err: any) {
    // Unexpected failure (e.g. DB issue) — mark FAILED but keep partial stats.
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'FAILED', stats: stats as any },
    })
    throw new Error(err?.message ?? 'Campaign send failed')
  }
}
