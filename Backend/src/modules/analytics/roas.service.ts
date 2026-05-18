import { prisma } from '../../lib/prisma'

export async function calculateConversationalROAS(workspaceId: string, campaignId: string) {
  // 1. Get total spend for this campaign
  const spendData = await prisma.adSpend.aggregate({
    where: { workspaceId, campaignId },
    _sum: { spend: true }
  })
  
  const totalSpend = spendData._sum.spend?.toNumber() || 0

  // 2. Get total value of won deals attributed to this campaign (via leads)
  const wonDeals = await prisma.deal.aggregate({
    where: { 
        workspaceId, 
        status: 'WON',
        contact: { sourceCampaignId: campaignId }
    },
    _sum: { value: true }
  })

  const totalRevenue = wonDeals._sum.value?.toNumber() || 0

  // 3. ROAS = Revenue / Spend
  const roas = totalSpend > 0 ? (totalRevenue / totalSpend) : 0
  
  return {
    totalSpend,
    totalRevenue,
    roas: roas.toFixed(2)
  }
}
