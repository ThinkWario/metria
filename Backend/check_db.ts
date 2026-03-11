import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // Check AdSpend table
  const adSpendCount = await prisma.adSpend.count()
  console.log(`\n=== AdSpend Table ===`)
  console.log(`Total records: ${adSpendCount}`)

  if (adSpendCount > 0) {
    const sample = await prisma.adSpend.findMany({
      take: 5,
      orderBy: { date: 'desc' },
      select: { date: true, platform: true, campaignName: true, spend: true }
    })
    console.log('Latest 5 records:', JSON.stringify(sample, null, 2))

    const dateRange = await prisma.adSpend.aggregate({
      _min: { date: true },
      _max: { date: true },
      _sum: { spend: true }
    })
    console.log('Date range:', dateRange._min.date, 'to', dateRange._max.date)
    console.log('Total spend:', dateRange._sum.spend)
  }

  // Check DailyMetric table for metaAdSpend
  console.log(`\n=== DailyMetric Table ===`)
  const dailyCount = await prisma.dailyMetric.count()
  console.log(`Total records: ${dailyCount}`)

  const latestMetrics = await prisma.dailyMetric.findMany({
    take: 10,
    orderBy: { date: 'desc' },
    select: { date: true, totalRevenue: true, metaAdSpend: true, googleAdSpend: true, netProfit: true }
  })
  console.log('Latest 10 daily metrics:')
  latestMetrics.forEach(m => {
    console.log(`  ${m.date.toISOString().split('T')[0]} | Revenue: ${m.totalRevenue} | MetaAds: ${m.metaAdSpend} | GoogleAds: ${m.googleAdSpend} | NetProfit: ${m.netProfit}`)
  })

  // Simulate what the /metrics/range endpoint returns
  console.log(`\n=== Simulating /metrics/range ===`)
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const metrics = await prisma.dailyMetric.findMany({
    where: { date: { gte: thirtyDaysAgo, lte: now } },
    orderBy: { date: 'asc' }
  })

  const filteredAdSpend = await prisma.adSpend.groupBy({
    by: ['date'],
    _sum: { spend: true },
    where: {
      platform: 'META',
      date: { gte: thirtyDaysAgo, lte: now }
    }
  })

  console.log(`DailyMetric records in range: ${metrics.length}`)
  console.log(`AdSpend grouped dates in range: ${filteredAdSpend.length}`)

  const metaSpendMap = filteredAdSpend.reduce((acc: Record<string, number>, s) => {
    const dateStr = s.date.toISOString().split('T')[0]
    acc[dateStr] = Number(s._sum.spend || 0)
    return acc
  }, {} as Record<string, number>)

  console.log('MetaSpend map:', JSON.stringify(metaSpendMap, null, 2))

  console.log('\nChart data that frontend would receive:')
  metrics.forEach(m => {
    const dateStr = (m as any).date.toISOString().split('T')[0]
    const metaSpend = metaSpendMap[dateStr] || 0
    const ventas = Number(m.totalRevenue)
    const ads = metaSpend + Number(m.googleAdSpend)
    const roas = ads > 0 ? ventas / ads : 0
    console.log(`  ${dateStr} | ventas: ${ventas} | ads(meta+google): ${metaSpend}+${Number(m.googleAdSpend)}=${ads} | roas: ${roas.toFixed(2)}`)
  })
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
