import { prisma } from '../../lib/prisma'

export interface ContactValue {
  ltv: number
  wonDealsValue: number
  wonDealsCount: number
  openPipelineValue: number
  openDealsCount: number
  lostDealsCount: number
  /** Total real captured value: won deals + paid orders (ltv shown separately). */
  capturedValue: number
  ordersTotal?: number
  ordersCount?: number
}

/**
 * Aggregates the real, per-customer financial value of a contact — Metria's
 * differentiator over generic CRMs. Combines the contact's stored LTV, deal
 * outcomes (won / open pipeline / lost), and — when the contact can be linked
 * to e-commerce orders by email — paid order revenue.
 *
 * The Order model has no contactId; the only reliable link is
 * `Order.customerEmail === Contact.email` (both scoped to the workspace), so
 * orders are included only when the contact has an email and matching orders
 * exist. Otherwise order fields are omitted gracefully.
 */
export async function getContactValue(workspaceId: string, contactId: string): Promise<ContactValue> {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, workspaceId },
    select: { id: true, ltv: true, email: true }
  })
  if (!contact) throw new Error('Contact not found')

  // Aggregate deals by status in a single grouped query.
  const dealGroups = await prisma.deal.groupBy({
    by: ['status'],
    where: { workspaceId, contactId },
    _sum: { value: true },
    _count: { _all: true }
  })

  let wonDealsValue = 0
  let wonDealsCount = 0
  let openPipelineValue = 0
  let openDealsCount = 0
  let lostDealsCount = 0

  for (const g of dealGroups) {
    const sum = Number(g._sum.value ?? 0)
    const count = g._count._all
    if (g.status === 'WON') {
      wonDealsValue += sum
      wonDealsCount += count
    } else if (g.status === 'LOST') {
      lostDealsCount += count
    } else {
      // OPEN (and any other in-progress status) counts as live pipeline.
      openPipelineValue += sum
      openDealsCount += count
    }
  }

  // Order-based revenue — only when the contact is linkable by email.
  let ordersTotal: number | undefined
  let ordersCount: number | undefined
  if (contact.email) {
    const orderAgg = await prisma.order.aggregate({
      where: {
        workspaceId,
        customerEmail: { equals: contact.email, mode: 'insensitive' },
        financialStatus: 'paid'
      },
      _sum: { totalPrice: true },
      _count: { _all: true }
    })
    const count = orderAgg._count._all
    if (count > 0) {
      ordersCount = count
      ordersTotal = Number(orderAgg._sum.totalPrice ?? 0)
    }
  }

  const ltv = Number(contact.ltv ?? 0)
  const capturedValue = wonDealsValue + (ordersTotal ?? 0)

  return {
    ltv,
    wonDealsValue,
    wonDealsCount,
    openPipelineValue,
    openDealsCount,
    lostDealsCount,
    capturedValue,
    ...(ordersCount !== undefined && { ordersCount, ordersTotal })
  }
}
