import { prisma } from '../../lib/prisma'

export async function getPipelineForecast(workspaceId: string) {
  const deals = await prisma.deal.findMany({
    where: { workspaceId, status: { not: 'LOST' } },
    select: {
      id: true,
      title: true,
      value: true,
      probability: true,
      expectedCloseAt: true,
      status: true,
      stage: { select: { name: true } }
    }
  })

  // Group by stage name
  const byStage: Record<string, { count: number; totalValue: number; weightedValue: number }> = {}
  let totalValue = 0
  let weightedValue = 0

  for (const deal of deals) {
    const v = Number(deal.value ?? 0)
    const p = (deal.probability ?? 50) / 100
    const stageName = deal.stage?.name ?? 'Sin etapa'

    if (!byStage[stageName]) byStage[stageName] = { count: 0, totalValue: 0, weightedValue: 0 }
    byStage[stageName].count++
    byStage[stageName].totalValue += v
    byStage[stageName].weightedValue += v * p

    totalValue += v
    weightedValue += v * p
  }

  // Next 3 months forecast
  const now = new Date()
  const forecast3Months = [0, 1, 2].map(offset => {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    const label = d.toLocaleString('es-CL', { month: 'short', year: '2-digit' })
    const monthDeals = deals.filter(deal => {
      if (!deal.expectedCloseAt) return false
      const c = new Date(deal.expectedCloseAt)
      return c.getFullYear() === d.getFullYear() && c.getMonth() === d.getMonth()
    })
    const weighted = monthDeals.reduce(
      (acc, deal) => acc + Number(deal.value ?? 0) * ((deal.probability ?? 50) / 100),
      0
    )
    return { label, weighted, count: monthDeals.length }
  })

  const topDeals = [...deals]
    .sort((a, b) => Number(b.value ?? 0) - Number(a.value ?? 0))
    .slice(0, 5)
    .map(d => ({
      id: d.id,
      title: d.title,
      value: Number(d.value ?? 0),
      probability: d.probability ?? 50,
      status: d.status,
      stage: d.stage?.name ?? 'Sin etapa'
    }))

  return {
    totalValue,
    weightedValue,
    totalDeals: deals.length,
    byStage,
    forecast3Months,
    topDeals
  }
}
