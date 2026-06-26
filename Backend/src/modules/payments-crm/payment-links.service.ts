import { prisma } from '../../lib/prisma'
import { MercadoPagoConfig, Preference } from 'mercadopago'
import 'dotenv/config'

// Reuse the SAME env var + client-init pattern as src/routes/payments.ts
const mpConfig = process.env.MERCADOPAGO_ACCESS_TOKEN
  ? new MercadoPagoConfig({ accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN })
  : null

export type PaymentLinkStatus = 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED'

export interface CreatePaymentLinkInput {
  contactId?: string | null
  dealId?: string | null
  amount: number
  currency?: string
  description?: string | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Hydrate payment links with contact names and deal titles.
 * Both relations are stored as plain IDs (no Prisma relation), so we resolve
 * them manually in parallel, scoped to the workspace.
 */
async function hydrateLinks(workspaceId: string, links: any[]) {
  const contactIds = [...new Set(links.map((l) => l.contactId).filter(Boolean))] as string[]
  const dealIds = [...new Set(links.map((l) => l.dealId).filter(Boolean))] as string[]

  const [contacts, deals] = await Promise.all([
    contactIds.length > 0
      ? prisma.contact.findMany({
          where: { workspaceId, id: { in: contactIds } },
          select: { id: true, name: true }
        })
      : [],
    dealIds.length > 0
      ? prisma.deal.findMany({
          where: { workspaceId, id: { in: dealIds } },
          select: { id: true, title: true }
        })
      : []
  ])

  const nameById = new Map(contacts.map((c) => [c.id, c.name]))
  const titleById = new Map(deals.map((d) => [d.id, d.title]))

  return links.map((l) => ({
    ...l,
    contactName: l.contactId ? nameById.get(l.contactId) ?? null : null,
    dealTitle: l.dealId ? titleById.get(l.dealId) ?? null : null
  }))
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Create a payment link (cobro).
 *
 * - If MERCADOPAGO_ACCESS_TOKEN is set: create a MercadoPago preference and store
 *   externalId = preference.id and url = preference.init_point.
 * - If the token is NOT set: still persist the PaymentLink row (PENDING, url null)
 *   and surface { needsConfig: true } so the UI can prompt the user to configure MP.
 *
 * Never throws because of a missing token.
 */
export async function createPaymentLink(workspaceId: string, input: CreatePaymentLinkInput) {
  const amount = Number(input.amount)
  if (!isFinite(amount) || amount <= 0) {
    throw new Error('amount must be a positive number')
  }

  const currency = (input.currency || 'CLP').toUpperCase()
  const description = input.description?.trim() || null

  let externalId: string | null = null
  let url: string | null = null
  let needsConfig = false

  if (mpConfig) {
    try {
      const preference = new Preference(mpConfig)
      const result = await preference.create({
        body: {
          items: [
            {
              id: 'cobro',
              title: description || 'Pago',
              quantity: 1,
              unit_price: amount,
              currency_id: currency
            }
          ],
          external_reference: workspaceId,
          metadata: {
            workspace_id: workspaceId,
            ...(input.contactId ? { contact_id: input.contactId } : {}),
            ...(input.dealId ? { deal_id: input.dealId } : {}),
            kind: 'crm_payment_link'
          }
        }
      })
      externalId = result.id ?? null
      url = result.init_point ?? null
    } catch (err: any) {
      // Don't fail the whole request if MP errors out — persist the row anyway
      // and let the UI know configuration / connectivity needs attention.
      console.error('[PaymentLinks] MercadoPago preference error:', err?.message || err)
      needsConfig = true
    }
  } else {
    needsConfig = true
  }

  const link = await prisma.paymentLink.create({
    data: {
      workspaceId,
      contactId: input.contactId || null,
      dealId: input.dealId || null,
      amount,
      currency,
      description,
      provider: 'MERCADOPAGO',
      externalId,
      url,
      status: 'PENDING'
    }
  })

  const [hydrated] = await hydrateLinks(workspaceId, [link])
  return { ...hydrated, needsConfig }
}

export async function listPaymentLinks(workspaceId: string) {
  const links = await prisma.paymentLink.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' }
  })
  return hydrateLinks(workspaceId, links)
}

export async function getPaymentLink(workspaceId: string, id: string) {
  const link = await prisma.paymentLink.findFirst({
    where: { id, workspaceId }
  })
  if (!link) throw new Error('Payment link not found')
  const [hydrated] = await hydrateLinks(workspaceId, [link])
  return hydrated
}

const VALID_STATUSES: PaymentLinkStatus[] = ['PENDING', 'PAID', 'EXPIRED', 'CANCELLED']

export async function updatePaymentLinkStatus(
  workspaceId: string,
  id: string,
  status: PaymentLinkStatus
) {
  if (!VALID_STATUSES.includes(status)) {
    throw new Error('Invalid status. Must be one of: ' + VALID_STATUSES.join(', '))
  }

  // Ensure the link exists and belongs to this workspace.
  await getPaymentLink(workspaceId, id)

  const updated = await prisma.paymentLink.update({
    where: { id },
    data: {
      status,
      ...(status === 'PAID' ? { paidAt: new Date() } : {})
    }
  })
  const [hydrated] = await hydrateLinks(workspaceId, [updated])
  return hydrated
}

/**
 * Convenience used by the public MP webhook: flip a link to PAID by its
 * MercadoPago preference id (externalId). Returns the updated row or null.
 */
export async function markPaidByExternalId(externalId: string) {
  const link = await prisma.paymentLink.findFirst({ where: { externalId } })
  if (!link) return null
  if (link.status === 'PAID') return link
  return prisma.paymentLink.update({
    where: { id: link.id },
    data: { status: 'PAID', paidAt: new Date() }
  })
}
