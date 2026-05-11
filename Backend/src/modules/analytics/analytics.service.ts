import { prisma } from '../../lib/prisma'
import { Prisma } from '@prisma/client'

export async function aggregateChannelSnapshot(
  workspaceId: string,
  channelId: string,
  dateStr: string
) {
  const start = new Date(dateStr + 'T00:00:00.000Z')
  const end = new Date(dateStr + 'T23:59:59.999Z')

  const [
    totalInbound,
    totalOutbound,
    newContacts,
    conversationsOpened,
    conversationsResolved,
    dealsCreated,
    dealsWon,
    dealsWonAgg,
    avgRows
  ] = await Promise.all([
    prisma.message.count({
      where: { conversation: { channelId }, direction: 'INBOUND', sentAt: { gte: start, lte: end } }
    }),
    prisma.message.count({
      where: { conversation: { channelId }, direction: 'OUTBOUND', sentAt: { gte: start, lte: end } }
    }),
    prisma.contact.count({
      where: { workspaceId, createdAt: { gte: start, lte: end } }
    }),
    prisma.conversation.count({
      where: { channelId, createdAt: { gte: start, lte: end } }
    }),
    prisma.conversation.count({
      where: { channelId, status: 'RESOLVED', updatedAt: { gte: start, lte: end } }
    }),
    prisma.deal.count({
      where: {
        contact: { conversations: { some: { channelId } } },
        createdAt: { gte: start, lte: end }
      }
    }),
    prisma.deal.count({
      where: {
        contact: { conversations: { some: { channelId } } },
        status: 'WON',
        updatedAt: { gte: start, lte: end }
      }
    }),
    prisma.deal.aggregate({
      _sum: { value: true },
      where: {
        contact: { conversations: { some: { channelId } } },
        status: 'WON',
        updatedAt: { gte: start, lte: end }
      }
    }),
    prisma.$queryRaw<Array<{ avg_seconds: number | null }>>(
      Prisma.sql`
        SELECT AVG(EXTRACT(EPOCH FROM (o.sent_at - i.sent_at)))::int AS avg_seconds
        FROM messages i
        JOIN conversations c ON c.id = i.conversation_id AND c.channel_id = ${channelId}
        JOIN LATERAL (
          SELECT sent_at FROM messages
          WHERE conversation_id = i.conversation_id AND direction = 'OUTBOUND' AND sent_at > i.sent_at
          ORDER BY sent_at ASC LIMIT 1
        ) o ON TRUE
        WHERE i.direction = 'INBOUND'
          AND i.sent_at >= ${start} AND i.sent_at <= ${end}
      `
    )
  ])

  const avgFirstResponseSeconds = Number(avgRows[0]?.avg_seconds ?? 0)
  const dealsWonValue = Number(dealsWonAgg._sum.value ?? 0)

  return prisma.channelAnalyticSnapshot.upsert({
    where: { workspaceId_channelId_date: { workspaceId, channelId, date: start } },
    create: {
      workspaceId,
      channelId,
      date: start,
      totalInbound,
      totalOutbound,
      newContacts,
      conversationsOpened,
      conversationsResolved,
      avgFirstResponseSeconds,
      dealsCreated,
      dealsWon,
      dealsWonValue,
      csatAvg: null
    },
    update: {
      totalInbound,
      totalOutbound,
      newContacts,
      conversationsOpened,
      conversationsResolved,
      avgFirstResponseSeconds,
      dealsCreated,
      dealsWon,
      dealsWonValue
    }
  })
}

export async function getSnapshots(
  workspaceId: string,
  days = 90,
  channelId?: string
) {
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - days)
  since.setUTCHours(0, 0, 0, 0)

  return prisma.channelAnalyticSnapshot.findMany({
    where: {
      workspaceId,
      ...(channelId ? { channelId } : {}),
      date: { gte: since }
    },
    include: { channel: { select: { id: true, name: true, platform: true } } },
    orderBy: { date: 'desc' }
  })
}

export async function getFunnelSummary(workspaceId: string, days = 90) {
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - days)
  since.setUTCHours(0, 0, 0, 0)

  const agg = await prisma.channelAnalyticSnapshot.aggregate({
    _sum: {
      totalInbound: true,
      totalOutbound: true,
      newContacts: true,
      conversationsOpened: true,
      conversationsResolved: true,
      dealsCreated: true,
      dealsWon: true,
      dealsWonValue: true,
      avgFirstResponseSeconds: true
    },
    where: { workspaceId, date: { gte: since } }
  })

  const s = agg._sum
  const opened = s.conversationsOpened ?? 0
  const resolved = s.conversationsResolved ?? 0

  return {
    totalInbound: s.totalInbound ?? 0,
    totalOutbound: s.totalOutbound ?? 0,
    newContacts: s.newContacts ?? 0,
    conversationsOpened: opened,
    conversationsResolved: resolved,
    dealsCreated: s.dealsCreated ?? 0,
    dealsWon: s.dealsWon ?? 0,
    dealsWonValue: Number(s.dealsWonValue ?? 0),
    avgResolutionRate: opened > 0 ? Math.round((resolved / opened) * 100) : 0,
    avgResponseSeconds: s.avgFirstResponseSeconds ?? 0
  }
}
