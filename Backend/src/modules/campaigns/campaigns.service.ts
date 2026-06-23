import { prisma } from '../../lib/prisma'
import { getSegmentContacts } from '../crm/segments.service'
import { getDriver, dispatch, isLiveChannel, type Channel } from './drivers'
import { generateUnsubscribeToken } from '../unsubscribe/unsubscribe.service'

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

/**
 * Rewrite links through a click tracker and append a 1x1 open-tracking pixel so
 * opens/clicks can be attributed to a specific recipient. EMAIL only.
 */
function injectTracking(html: string, recipientId: string): string {
  const base = (process.env.API_BASE_URL ?? 'http://localhost:4000').replace(/\/$/, '')

  let result = html.replace(
    /href="(https?:\/\/[^"]{1,2048})"/gi,
    (_match, url: string) => `href="${base}/t/c/${recipientId}?url=${encodeURIComponent(url)}"`
  )

  const pixel = `<img src="${base}/t/o/${recipientId}" width="1" height="1" style="display:none" alt="" />`

  const token = generateUnsubscribeToken(recipientId)
  const unsubUrl = `${process.env.BACKEND_URL ?? 'http://localhost:4000'}/unsubscribe/${token}`
  const footer =
    `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #eee;font-size:12px;` +
    `color:#888;text-align:center">` +
    `Si no deseas recibir más correos, ` +
    `<a href="${unsubUrl}" style="color:#888">haz clic aquí para desuscribirte</a>.` +
    `</div>`

  if (result.includes('</body>')) {
    result = result.replace('</body>', `${pixel}${footer}</body>`)
  } else {
    result = result + pixel + footer
  }

  return result
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

        // Render merge tags.
        const renderedBody = renderMergeTags(campaign.body, contact as any)
        const subject = campaign.subject ? renderMergeTags(campaign.subject, contact as any) : ''

        // Create the recipient record up-front so EMAIL tracking links/pixel can
        // reference its id; we update status after dispatch.
        const recipient = await prisma.campaignRecipient.create({
          data: {
            campaignId,
            workspaceId,
            contactId: contact.id,
            status: 'PENDING',
          },
        })

        const body =
          channel === 'EMAIL' ? injectTracking(renderedBody, recipient.id) : renderedBody

        let result_: { ok: boolean; error?: string }
        try {
          result_ = await dispatch(driver, channel, address, subject, body)
        } catch (err: any) {
          // Drivers shouldn't throw, but stay defensive regardless.
          result_ = { ok: false, error: err?.message ?? 'Error de envío' }
        }

        if (result_.ok) {
          stats.sent++
          await prisma.campaignRecipient.update({
            where: { id: recipient.id },
            data: { status: 'SENT', sentAt: new Date() },
          })
        } else {
          stats.failed++
          await prisma.campaignRecipient.update({
            where: { id: recipient.id },
            data: { status: 'FAILED', error: result_.error ?? 'Error de envío' },
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

// ── Single-contact send (workflow drip sequences) ─────────────────────────────

/**
 * Send a campaign to a single contact — used by workflow drip sequences rather
 * than the segment-wide blast. Records a recipient row and updates its status.
 */
export async function sendToSingleContact(params: {
  campaignId: string
  contactId: string
  workspaceId: string
}): Promise<void> {
  const { campaignId, contactId, workspaceId } = params

  const [campaign, contact] = await Promise.all([
    prisma.campaign.findFirst({ where: { id: campaignId, workspaceId } }),
    prisma.contact.findFirst({ where: { id: contactId, workspaceId } }),
  ])

  if (!campaign || !contact) return

  const channel = campaign.channel as CampaignChannel
  const address = recipientAddress(channel, contact)
  if (!address) return

  const recipient = await prisma.campaignRecipient.create({
    data: { campaignId, workspaceId, contactId, status: 'PENDING' },
  })

  const renderedBody = renderMergeTags(campaign.body, contact)
  const subject = campaign.subject ? renderMergeTags(campaign.subject, contact) : ''
  const body = channel === 'EMAIL' ? injectTracking(renderedBody, recipient.id) : renderedBody

  const driver = getDriver(channel)
  let result_: { ok: boolean; error?: string }
  try {
    result_ = await dispatch(driver, channel, address, subject, body)
  } catch (err: any) {
    result_ = { ok: false, error: err?.message ?? 'Error de envío' }
  }

  if (result_.ok) {
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: { status: 'SENT', sentAt: new Date() },
    })
  } else {
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: { status: 'FAILED', error: result_.error ?? 'Error de envío' },
    })
  }
}

// ── Stats ──────────────────────────────────────────────────────────────────────

/**
 * Aggregate per-status recipient counts into delivery + engagement rates.
 * `sent` counts every recipient that left the system (SENT/OPENED/CLICKED).
 */
export async function getCampaignStats(workspaceId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, workspaceId } })
  if (!campaign) throw new Error('Campaign not found')

  const grouped = await prisma.campaignRecipient.groupBy({
    by: ['status'],
    where: { campaignId, workspaceId },
    _count: { _all: true },
  })

  const counts: Record<string, number> = {}
  for (const g of grouped) counts[g.status] = g._count._all

  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const sent = (counts['SENT'] ?? 0) + (counts['OPENED'] ?? 0) + (counts['CLICKED'] ?? 0)
  const opened = counts['OPENED'] ?? 0
  const clicked = counts['CLICKED'] ?? 0

  return {
    total,
    sent,
    failed: counts['FAILED'] ?? 0,
    opened,
    clicked,
    openRate: sent > 0 ? Number((opened / sent).toFixed(3)) : 0,
    clickRate: sent > 0 ? Number((clicked / sent).toFixed(3)) : 0,
  }
}

// ── Schedule ────────────────────────────────────────────────────────────────

/**
 * Schedule a DRAFT (or SCHEDULED) campaign for a future date.
 * Re-scheduling an already-SCHEDULED campaign is allowed (updates the date).
 */
export async function scheduleCampaign(
  workspaceId: string,
  campaignId: string,
  scheduledAt: string
) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, workspaceId },
  })
  if (!campaign) throw new Error('Campaign not found')
  if (!DELETABLE_STATUSES.includes(campaign.status)) {
    throw new Error('Only DRAFT or SCHEDULED campaigns can be scheduled')
  }

  const date = new Date(scheduledAt)
  if (isNaN(date.getTime())) throw new Error('Invalid scheduledAt date')
  if (date <= new Date()) throw new Error('scheduledAt must be in the future')

  return prisma.campaign.update({
    where: { id: campaignId },
    data: { status: 'SCHEDULED', scheduledAt: date },
  })
}

// ── Test send ────────────────────────────────────────────────────────────────

/**
 * Send a single test email to the given address using the campaign body/subject
 * with placeholder merge-tag values.  Always sends as EMAIL regardless of the
 * campaign's actual channel, because a test should always be reviewable by the
 * sender.
 */
export async function testSendCampaign(
  workspaceId: string,
  campaignId: string,
  email: string
) {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Invalid email address')
  }

  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, workspaceId },
  })
  if (!campaign) throw new Error('Campaign not found')

  // Render with obvious test values so merge tags are clearly exercised.
  const testContact = { name: 'Contacto de prueba', phone: '+56 9 0000 0000', email }
  const body = renderMergeTags(campaign.body, testContact)
  const subject = campaign.subject
    ? renderMergeTags(campaign.subject, testContact)
    : `[TEST] ${campaign.name}`

  if (!isLiveChannel('EMAIL')) {
    console.log(`[TestSend] No email provider configured.`)
    console.log(`[TestSend] Campaign: "${campaign.name}"  To: ${email}`)
    console.log(`[TestSend] Subject: ${subject}`)
    console.log(`[TestSend] Body:\n${body}`)
    return { sent: false, to: email, reason: 'No email provider configured' }
  }

  const driver = getDriver('EMAIL')
  const result = await dispatch(driver, 'EMAIL', email, subject, body)
  return { sent: result.ok, to: email, ...(result.error ? { error: result.error } : {}) }
}
