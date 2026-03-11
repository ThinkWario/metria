import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth'
import { cacheMiddleware, CACHE_TTL, invalidateWorkspaceCache } from '../middleware/cache'
import { getStartOfDay, getEndOfDay } from '../lib/dateUtils'

const router = Router()
const TIMEZONE = 'America/Santiago'

import { createAuditLog } from '../lib/logger'

// Sync Meta Ads via Graph API
router.post('/sync', authenticate, async (req: AuthRequest, res) => {
    try {
        console.log("Triggering meta sync endpoint")
        const workspaceId = req.user?.workspaceId
        if (!workspaceId) return res.status(400).json({ error: 'Workspace required' })

        // Get Meta integration config
        const integration = await prisma.integration.findUnique({
            where: { workspaceId_platform: { workspaceId, platform: 'meta' } }
        })

        if (!integration || !integration.config) {
            return res.status(400).json({ error: 'Meta Ads integration not configured' })
        }

        const config = integration.config as Record<string, string>
        const accessToken = config.accessToken
        const adAccountId = config.adAccountId

        if (!accessToken || !adAccountId) {
            return res.status(400).json({ error: 'Missing accessToken or adAccountId in Meta config' })
        }

        const formattedAdAccountId = adAccountId.replace(/^act_/, '')
        // Fetch last 90 days of daily campaign data with pagination
        const allInsights: any[] = []
        let nextUrl: string | null = `https://graph.facebook.com/v20.0/act_${formattedAdAccountId}/insights?level=campaign&time_preset=last_90d&time_increment=1&fields=campaign_id,campaign_name,spend,impressions,clicks,actions,action_values,date_start&limit=500&access_token=${accessToken}`

        while (nextUrl) {
            const response: Response = await fetch(nextUrl)

            if (!response.ok) {
                const errText = await response.text()
                console.error('Meta Sync API Error:', response.status, errText)
                let errMsg = 'Failed to fetch from Meta Graph API'
                try {
                    const parsed = JSON.parse(errText)
                    if (parsed?.error?.message) {
                        errMsg = `Meta API Error: ${parsed.error.message}`
                    }
                } catch (e) { }
                // If we already have some data, continue with what we got
                if (allInsights.length > 0) {
                    console.warn(`Meta pagination stopped after ${allInsights.length} rows. Continuing with partial data.`)
                    break
                }
                return res.status(response.status).json({ error: errMsg })
            }

            const data: any = await response.json()
            const pageInsights = data.data || []
            allInsights.push(...pageInsights)

            // Follow pagination cursor
            nextUrl = data.paging?.next || null
            console.log(`[Meta Sync] Fetched page with ${pageInsights.length} rows (total: ${allInsights.length})`)
        }

        let processed = 0
        const dailySpends: Record<string, number> = {}

        for (const row of allInsights) {
            const dateStr = row.date_start
            const spend = parseFloat(row.spend || '0')
            dailySpends[dateStr] = (dailySpends[dateStr] || 0) + spend

            const conversionsAction = row.actions?.find((a: any) => a.action_type === 'purchase')
            const conversions = conversionsAction ? parseInt(conversionsAction.value) : 0

            const conversionValueAction = row.action_values?.find((a: any) => a.action_type === 'purchase')
            const conversionValue = conversionValueAction ? parseFloat(conversionValueAction.value) : 0

            await prisma.adSpend.upsert({
                where: { workspaceId_platform_campaignId_date: { workspaceId, platform: 'META', campaignId: row.campaign_id, date: new Date(dateStr) } },
                update: {
                    campaignName: row.campaign_name,
                    spend,
                    impressions: parseInt(row.impressions || '0'),
                    clicks: parseInt(row.clicks || '0'),
                    conversions,
                    conversionValue
                },
                create: {
                    workspaceId,
                    platform: 'META',
                    campaignId: row.campaign_id,
                    campaignName: row.campaign_name,
                    spend,
                    impressions: parseInt(row.impressions || '0'),
                    clicks: parseInt(row.clicks || '0'),
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
                        metaAdSpend: spend,
                        netProfit: Number(existing.totalRevenue) - spend - Number(existing.googleAdSpend) - Number(existing.tiktokAdSpend || 0) - Number(existing.totalShipping) - Number(existing.totalCogs)
                    }
                })
            } else {
                await prisma.dailyMetric.create({
                    data: {
                        workspaceId,
                        date: dateObj,
                        totalRevenue: 0,
                        metaAdSpend: spend,
                        googleAdSpend: 0,
                        tiktokAdSpend: 0,
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
            source: 'META',
            event: 'Sync',
            status: '200 OK',
            message: `Sincronizadas ${processed} analíticas diarias de campañas de Meta Ads (vía date_start).`
        })

        // Invalidate cache so frontend gets fresh data
        await invalidateWorkspaceCache(workspaceId)

        return res.status(200).json({ success: true, count: processed })
    } catch (error) {
        console.error('Meta Sync Error:', error)
        return res.status(500).json({ error: 'Internal server error while syncing Meta Ads' })
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

        // Obtenemos los AdSpend agrupados por campaña de META
        const campaigns = await prisma.adSpend.groupBy({
            by: ['campaignId', 'campaignName'],
            where: {
                workspaceId,
                platform: 'META',
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

router.get('/creatives', authenticate, cacheMiddleware(CACHE_TTL.HOUR_1), async (req: AuthRequest, res) => {
    try {
        const workspaceId = req.user?.workspaceId
        if (!workspaceId) return res.status(400).json({ error: 'Workspace required' })

        const { from, to } = req.query

        const integration = await prisma.integration.findUnique({
            where: { workspaceId_platform: { workspaceId, platform: 'meta' } }
        })

        if (!integration || !integration.config) {
            return res.status(200).json([])
        }

        const config = integration.config as Record<string, string>
        const accessToken = config.accessToken
        const adAccountId = config.adAccountId

        if (!accessToken || !adAccountId) return res.status(200).json([])

        const formattedAdAccountId = adAccountId.replace(/^act_/, '')

        // Handle date range for Meta Graph API
        let timeRangeParams = 'time_preset=last_30d'
        if (from && to) {
            timeRangeParams = `time_range={'since':'${from}','until':'${to}'}`
        }

        const response = await fetch(`https://graph.facebook.com/v20.0/act_${formattedAdAccountId}/insights?level=ad&${timeRangeParams}&fields=ad_name,spend,actions,action_values&limit=4&access_token=${accessToken}`)

        if (!response.ok) {
            console.error('Meta Creatives Fetch Error:', await response.text())
            return res.status(200).json([])
        }

        const data = await response.json()
        const insights = data.data || []

        const creatives = insights.map((row: any) => {
            const spend = parseFloat(row.spend || '0')
            const conversionValueAction = row.action_values?.find((a: any) => a.action_type === 'purchase')
            const conversionValue = conversionValueAction ? parseFloat(conversionValueAction.value) : 0

            return {
                name: row.ad_name || 'Anuncio sin nombre',
                roas: spend > 0 ? Number((conversionValue / spend).toFixed(2)) : 0
            }
        })

        creatives.sort((a: any, b: any) => b.roas - a.roas)
        return res.status(200).json(creatives)
    } catch (error) {
        console.error('Creatives error:', error)
        return res.status(500).json({ error: 'Internal server error' })
    }
})

router.get('/attribution', authenticate, cacheMiddleware(CACHE_TTL.MINUTE_5), async (req: AuthRequest, res) => {
    try {
        const workspaceId = req.user?.workspaceId
        if (!workspaceId) return res.status(400).json({ error: 'Workspace required' })

        const { from, to, excludeCampaigns } = req.query as { from?: string; to?: string; excludeCampaigns?: string }
        const excludedIds = excludeCampaigns ? excludeCampaigns.split(',') : []

        const dateFilter = from && to ? {
            date: {
                gte: getStartOfDay(from as string),
                lte: getEndOfDay(to as string)
            }
        } : {}

        const orderDateFilter = from && to ? {
            createdAt: {
                gte: getStartOfDay(from as string),
                lte: getEndOfDay(to as string)
            }
        } : {}

        // Get total Meta Conversions (Purchases) from synced AdSpends, excluding filtered campaigns
        const metaSpends = await prisma.adSpend.aggregate({
            where: {
                workspaceId,
                platform: 'META',
                campaignId: excludedIds.length > 0 ? { notIn: excludedIds } : undefined,
                ...dateFilter
            },
            _sum: { conversions: true }
        })

        // Get total real orders from Shopify
        const shopifyOrders = await prisma.order.count({
            where: {
                workspaceId,
                ...orderDateFilter
            }
        })

        const attributed = Number(metaSpends._sum.conversions || 0)
        const total = shopifyOrders
        const orphaned = Math.max(0, total - attributed)
        const lossRate = total > 0 ? Math.round((orphaned / total) * 100) : 0

        return res.status(200).json({ attributed, orphaned, total, lossRate })
    } catch (error) {
        console.error('Attribution error:', error)
        return res.status(500).json({ error: 'Internal server error' })
    }
})

export default router
