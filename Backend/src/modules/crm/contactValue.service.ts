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

export interface RevenueSummary {
  contactRevenue: {
    totalRevenue: number
    orderCount: number
    avgOrderValue: number
    lastPurchaseDate: string | null
  }
  workspaceContext: {
    avgROAS: number | null
    totalAdSpend30d: number
    totalRevenue30d: number
    netProfit30d: number
  }
}

export async function getRevenueSummary(workspaceId: string, contactId: string): Promise<RevenueSummary> {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, workspaceId },
    select: { email: true }
  })
  if (!contact) throw new Error('Contact not found')

  let totalRevenue = 0
  let orderCount = 0
  let avgOrderValue = 0
  let lastPurchaseDate: string | null = null

  if (contact.email) {
    const agg = await prisma.order.aggregate({
      where: {
        workspaceId,
        customerEmail: { equals: contact.email, mode: 'insensitive' },
        financialStatus: 'paid'
      },
      _sum: { totalPrice: true },
      _count: { _all: true },
      _max: { createdAt: true }
    })
    orderCount = agg._count._all
    totalRevenue = Number(agg._sum.totalPrice ?? 0)
    avgOrderValue = orderCount > 0 ? Math.round((totalRevenue / orderCount) * 100) / 100 : 0
    lastPurchaseDate = agg._max.createdAt ? agg._max.createdAt.toISOString() : null
  }

  const since30d = new Date()
  since30d.setDate(since30d.getDate() - 30)

  const wsAgg = await prisma.dailyMetric.aggregate({
    where: { workspaceId, date: { gte: since30d } },
    _sum: {
      totalRevenue: true,
      netProfit: true,
      metaAdSpend: true,
      googleAdSpend: true,
      tiktokAdSpend: true
    }
  })

  const totalRevenue30d = Number(wsAgg._sum.totalRevenue ?? 0)
  const netProfit30d = Number(wsAgg._sum.netProfit ?? 0)
  const totalAdSpend30d =
    Number(wsAgg._sum.metaAdSpend ?? 0) +
    Number(wsAgg._sum.googleAdSpend ?? 0) +
    Number(wsAgg._sum.tiktokAdSpend ?? 0)
  const avgROAS =
    totalAdSpend30d > 0
      ? Math.round((totalRevenue30d / totalAdSpend30d) * 100) / 100
      : null

  return {
    contactRevenue: { totalRevenue, orderCount, avgOrderValue, lastPurchaseDate },
    workspaceContext: { avgROAS, totalAdSpend30d, totalRevenue30d, netProfit30d }
  }
}
