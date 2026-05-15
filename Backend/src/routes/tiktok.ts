import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth'
import { cacheMiddleware, CACHE_TTL, invalidateWorkspaceCache } from '../middleware/cache'
import { getStartOfDay, getEndOfDay } from '../lib/dateUtils'
import { createAuditLog } from '../lib/logger'
import { upsertDailyMetric } from '../lib/metrics'

const router = Router()

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

        const metrics = [
            "spend", 
            "impressions", 
            "clicks", 
            "conversion", 
            "total_purchase_value",
            "video_views_p25",
            "video_views_p50",
            "video_views_p75",
            "video_views_p100",
            "six_seconds_video_views",
            "reach",
            "frequency"
        ]
        const dimensions = ["stat_time_day", "campaign_id", "campaign_name"]
        
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
                    campaignName: row.dimensions.campaign_name || row.dimensions.campaign_id?.toString() || 'TikTok Campaign',
                    spend,
                    impressions: parseInt(metricsObj.impressions || '0'),
                    reach: parseInt(metricsObj.reach || '0'),
                    clicks: parseInt(metricsObj.clicks || '0'),
                    videoViews: parseInt(metricsObj.video_play || '0'),
                    videoViewsP25: parseInt(metricsObj.video_views_p25 || '0'),
                    videoViewsP50: parseInt(metricsObj.video_views_p50 || '0'),
                    videoViewsP75: parseInt(metricsObj.video_views_p75 || '0'),
                    videoViewsP100: parseInt(metricsObj.video_views_p100 || '0'),
                    videoViews6s: parseInt(metricsObj.six_seconds_video_views || '0'),
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
                    reach: parseInt(metricsObj.reach || '0'),
                    clicks: parseInt(metricsObj.clicks || '0'),
                    videoViews: parseInt(metricsObj.video_play || '0'),
                    videoViewsP25: parseInt(metricsObj.video_views_p25 || '0'),
                    videoViewsP50: parseInt(metricsObj.video_views_p50 || '0'),
                    videoViewsP75: parseInt(metricsObj.video_views_p75 || '0'),
                    videoViewsP100: parseInt(metricsObj.video_views_p100 || '0'),
                    videoViews6s: parseInt(metricsObj.six_seconds_video_views || '0'),
                    conversions,
                    conversionValue,
                    date: new Date(dateStr)
                }
            })
            processed++
        }

        // Update DailyMetrics
        for (const [dateStr, spend] of Object.entries(dailySpends)) {
            await upsertDailyMetric(workspaceId, new Date(dateStr), 'tiktokAdSpend', spend)
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
                conversionValue: true,
                videoViews: true,
                videoViews6s: true,
                videoViewsP25: true,
                videoViewsP50: true,
                videoViewsP75: true,
                videoViewsP100: true
            }
        })

        const formatted = campaigns.map(c => {
            const spend = Number(c._sum.spend || 0)
            const conversions = Number(c._sum.conversions || 0)
            const conversionValue = Number(c._sum.conversionValue || 0)
            const impressions = Number(c._sum.impressions || 0)
            const video6s = Number(c._sum.videoViews6s || 0)
            const p25 = Number(c._sum.videoViewsP25 || 0)
            const p50 = Number(c._sum.videoViewsP50 || 0)
            const p75 = Number(c._sum.videoViewsP75 || 0)
            const p100 = Number(c._sum.videoViewsP100 || 0)

            return {
                id: c.campaignId,
                name: c.campaignName,
                status: 'Active', 
                spend,
                impressions,
                cpa: conversions > 0 ? spend / conversions : 0,
                roas: spend > 0 ? conversionValue / spend : 0,
                clicks: Number(c._sum.clicks || 0),
                conversions,
                video6s,
                p25,
                p50,
                p75,
                p100,
                hookRate: impressions > 0 ? (p25 / impressions) * 100 : 0,
                engagedViewRate: impressions > 0 ? (video6s / impressions) * 100 : 0
            }
        })

        return res.status(200).json(formatted)
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' })
    }
})

router.get('/daily-performance', authenticate, cacheMiddleware(CACHE_TTL.MINUTE_5), async (req: AuthRequest, res) => {
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

        const rows = await prisma.adSpend.groupBy({
            by: ['date'],
            where: { workspaceId, platform: 'TIKTOK', ...dateFilter },
            _sum: { spend: true, conversions: true },
            orderBy: { date: 'asc' }
        })

        const formatted = rows.map(r => {
            const spend = Number(r._sum.spend || 0)
            const conversions = Number(r._sum.conversions || 0)
            return {
                date: new Date(r.date).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }),
                spend,
                conversions,
                cpa: conversions > 0 ? spend / conversions : 0
            }
        })

        return res.status(200).json(formatted)
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' })
    }
})

// 3. GET /tiktok/creatives
router.get('/creatives', authenticate, cacheMiddleware(CACHE_TTL.HOUR_1), async (req: AuthRequest, res) => {
    try {
        const workspaceId = req.user?.workspaceId
        if (!workspaceId) return res.status(400).json({ error: 'Workspace required' })

        // Mock TikTok Creatives for now
        const creatives = [
            { name: "Video_Vertical_Hook_A", roas: 4.25, conversions: 45, spend: 120.50 },
            { name: "UGC_Testimonial_01", roas: 3.80, conversions: 32, spend: 85.00 },
            { name: "Product_Showcase_Tilt", roas: 2.15, conversions: 12, spend: 55.75 },
            { name: "Discount_Flash_Sale", roas: 5.10, conversions: 68, spend: 133.20 }
        ]

        creatives.sort((a, b) => b.roas - a.roas)
        return res.status(200).json(creatives)
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' })
    }
})

export default router
