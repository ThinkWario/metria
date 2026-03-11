import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth'
import { cacheMiddleware, CACHE_TTL, invalidateWorkspaceCache } from '../middleware/cache'
import { getStartOfDay, getEndOfDay } from '../lib/dateUtils'
import { createAuditLog } from '../lib/logger'

const router = Router()
const TIMEZONE = 'America/Santiago'

// Sync TikTok Ads via Graph API
router.post('/sync', authenticate, async (req: AuthRequest, res) => {
    try {
        console.log("Triggering tiktok sync endpoint")
        const workspaceId = req.user?.workspaceId
        if (!workspaceId) return res.status(400).json({ error: 'Workspace required' })

        // Get TikTok integration config
        const integration = await prisma.integration.findUnique({
            where: { workspaceId_platform: { workspaceId, platform: 'tiktok' } }
        })

        if (!integration || !integration.config) {
            return res.status(400).json({ error: 'TikTok Ads integration not configured' })
        }

        const config = integration.config as Record<string, string>
        const accessToken = config.accessToken
        const adAccountId = config.adAccountId

        if (!accessToken || !adAccountId) {
            return res.status(400).json({ error: 'Missing accessToken or adAccountId in TikTok config' })
        }

        const metrics = ["spend", "impressions", "clicks", "conversion", "total_purchase_value"]
        const dimensions = ["stat_time_day", "campaign_id"]
        
        // Let's fetch last 30 days locally since TikTok API expects start_date and end_date
        const endDateObj = new Date()
        const startDateObj = new Date()
        startDateObj.setDate(startDateObj.getDate() - 30) // Last 30 days
        
        const start_date = startDateObj.toISOString().split('T')[0]
        const end_date = endDateObj.toISOString().split('T')[0]

        const params = new URLSearchParams({
            advertiser_id: adAccountId,
            report_type: 'BASIC',
            data_level: 'AUCTION_CAMPAIGN',
            dimensions: JSON.stringify(dimensions),
            metrics: JSON.stringify(metrics),
            start_date: start_date,
            end_date: end_date,
            page_size: '1000'
        })

        const allInsights: any[] = []
        let page = 1
        
        let hasMore = true

        while (hasMore) {
            params.set('page', page.toString())
            const url = `https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/?${params.toString()}`

            const response: Response = await fetch(url, {
                headers: {
                    'Access-Token': accessToken,
                    'Content-Type': 'application/json'
                }
            })

            if (!response.ok) {
                const errText = await response.text()
                console.error('TikTok Sync API HTTP Error:', response.status, errText)
                if (allInsights.length > 0) break
                return res.status(response.status).json({ error: 'Failed to fetch from TikTok API' })
            }

            const data: any = await response.json()
            if (data.code !== 0) {
                console.error('TikTok API Logic Error:', data)
                if (allInsights.length > 0) break
                return res.status(400).json({ error: `TikTok API Error: ${data.message}` })
            }

            const pageInsights = data.data?.list || []
            allInsights.push(...pageInsights)

            const totalPage = data.data?.page_info?.total_page || 1
            if (page >= totalPage) {
                hasMore = false
            } else {
                page++
            }
        }

        let processed = 0
        const dailySpends: Record<string, number> = {}

        for (const row of allInsights) {
            const dateStr = row.dimensions?.stat_time_day
            if (!dateStr) continue

            const metricsObj = row.metrics || {}
            // Clean spend
            const spend = parseFloat(metricsObj.spend || '0')
            dailySpends[dateStr] = (dailySpends[dateStr] || 0) + spend

            const conversions = parseInt(metricsObj.conversion || '0')
            const conversionValue = parseFloat(metricsObj.total_purchase_value || '0')

            await prisma.adSpend.upsert({
                where: { workspaceId_platform_campaignId_date: { workspaceId, platform: 'TIKTOK', campaignId: row.dimensions.campaign_id?.toString() || '', date: new Date(dateStr) } },
                update: {
                    // Campaign name might not come via BASIC report unless we add campaign_name to dimensions or fetch campaign info. 
                    // Let's assume it's omitted or we store campaignId as name if missing
                    campaignName: row.dimensions.campaign_name || row.dimensions.campaign_id?.toString() || 'TikTok Campaign',
                    spend,
                    impressions: parseInt(metricsObj.impressions || '0'),
                    clicks: parseInt(metricsObj.clicks || '0'),
                    conversions,
                    conversionValue
                },
                create: {
                    workspaceId,
                    platform: 'TIKTOK',
                    campaignId: row.dimensions.campaign_id?.toString() || '',
                    campaignName: row.dimensions.campaign_name || row.dimensions.campaign_id?.toString() || 'TikTok Campaign',
                    spend,
                    impressions: parseInt(metricsObj.impressions || '0'),
                    clicks: parseInt(metricsObj.clicks || '0'),
                    conversions,
                    conversionValue,
                    date: new Date(dateStr)
                }
            })
            processed++
        }

        // Update DailyMetrics
        for (const [dateStr, spend] of Object.entries(dailySpends)) {
            const dateObj = new Date(dateStr)
            const existing = await prisma.dailyMetric.findUnique({ where: { workspaceId_date: { workspaceId, date: dateObj } } })

            if (existing) {
                await prisma.dailyMetric.update({
                    where: { id: existing.id },
                    data: {
                        tiktokAdSpend: spend,
                        netProfit: Number(existing.totalRevenue) - spend - Number(existing.metaAdSpend) - Number(existing.googleAdSpend) - Number(existing.totalShipping) - Number(existing.totalCogs)
                    }
                })
            } else {
                await prisma.dailyMetric.create({
                    data: {
                        workspaceId,
                        date: dateObj,
                        totalRevenue: 0,
                        metaAdSpend: 0,
                        googleAdSpend: 0,
                        tiktokAdSpend: spend,
                        totalShipping: 0,
                        totalCogs: 0,
                        netProfit: -spend,
                    }
                })
            }
        }

        await prisma.integration.update({
            where: { id: integration.id },
            data: { lastSync: new Date(), status: 'Connected' }
        })

        await createAuditLog({
            workspaceId,
            source: 'TIKTOK',
            event: 'Sync',
            status: '200 OK',
            message: `Sincronizadas ${processed} analíticas diarias de campañas de TikTok Ads.`
        })

        // Invalidate cache so frontend gets fresh data
        await invalidateWorkspaceCache(workspaceId)

        return res.status(200).json({ success: true, count: processed })
    } catch (error) {
        console.error('TikTok Sync Error:', error)
        return res.status(500).json({ error: 'Internal server error while syncing TikTok Ads' })
    }
})

router.get('/campaigns', authenticate, cacheMiddleware(CACHE_TTL.MINUTE_5), async (req: AuthRequest, res) => {
    try {
        const workspaceId = req.user?.workspaceId
        if (!workspaceId) return res.status(400).json({ error: 'Workspace required' })

        const { from, to } = req.query
        const dateFilter = from && to ? {
            date: {
                gte: getStartOfDay(from as string),
                lte: getEndOfDay(to as string)
            }
        } : {}

        // Obtenemos los AdSpend agrupados por campaña de TIKTOK
        const campaigns = await prisma.adSpend.groupBy({
            by: ['campaignId', 'campaignName'],
            where: {
                workspaceId,
                platform: 'TIKTOK',
                ...dateFilter
            },
            _sum: {
                spend: true,
                impressions: true,
                clicks: true,
                conversions: true,
                conversionValue: true
            }
        })

        const formatted = campaigns.map(c => {
            const spend = Number(c._sum.spend || 0)
            const conversions = Number(c._sum.conversions || 0)
            const conversionValue = Number(c._sum.conversionValue || 0)
            return {
                id: c.campaignId,
                name: c.campaignName,
                status: 'Active', // Mocked status
                spend,
                cpa: conversions > 0 ? spend / conversions : 0,
                roas: spend > 0 ? conversionValue / spend : 0,
                cpp: conversions > 0 ? spend / conversions : 0,
            }
        })

        return res.status(200).json(formatted)
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' })
    }
})

export default router
