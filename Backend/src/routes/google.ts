import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth'
import { cacheMiddleware, CACHE_TTL, invalidateWorkspaceCache } from '../middleware/cache'
import { upsertDailyMetric } from '../lib/metrics'

const router = Router()

import { createAuditLog } from '../lib/logger'

router.post('/sync', authenticate, async (req: AuthRequest, res) => {
    try {
        const workspaceId = req.user?.workspaceId
        if (!workspaceId) return res.status(400).json({ error: 'Workspace required' })

        // Get Google integration config
        const integration = await prisma.integration.findUnique({
            where: { workspaceId_platform: { workspaceId, platform: 'google' } }
        })

        if (!integration || !integration.config) {
            return res.status(400).json({ error: 'Google Ads integration not configured' })
        }

        const config = integration.config as Record<string, string>
        const developerToken = config.developerToken?.trim()
        const rawCustomerId = config.customerId?.trim()
        let accessToken = (config.accessToken || config.refreshToken)?.trim()

        if (!developerToken || !rawCustomerId || !accessToken) {
            return res.status(400).json({ error: 'Missing developerToken, customerId, or accessToken in Google config' })
        }

        const customerId = rawCustomerId.replace(/-/g, '')
        const managerId = (config.managerId || process.env.GOOGLE_ADS_MANAGER_ID || '')?.replace(/-/g, '')
        const clientId = config.clientId || process.env.GOOGLE_ADS_CLIENT_ID || ''
        const clientSecret = config.clientSecret || process.env.GOOGLE_ADS_CLIENT_SECRET || ''

        // Auto-refresh token if it's a refresh token
        if (!accessToken.startsWith('ya29.')) {
            // It's a refresh token, we need to exchange it
            if (!clientId || !clientSecret) {
                return res.status(400).json({ error: 'Missing OAuth Client ID or Client Secret to perform token exchange.' })
            }

            const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client_id: clientId,
                    client_secret: clientSecret,
                    refresh_token: accessToken,
                    grant_type: 'refresh_token'
                })
            })

            if (!tokenRes.ok) {
                console.error('Failed to get Google Ads access token:', await tokenRes.text())
                return res.status(401).json({ error: 'Failed to authenticate Google Ads with the provided Refresh Token and Client Credentials.' })
            }

            const tokenData = await tokenRes.json()
            accessToken = tokenData.access_token

            // Optionally update config with the new short-lived access token
            await prisma.integration.update({
                where: { id: integration.id },
                data: {
                    config: {
                        ...config,
                        accessToken: accessToken,
                        refreshToken: config.refreshToken || config.accessToken
                    }
                }
            })
        }

        // Logic to hit Google Ads REST API
        // https://googleads.googleapis.com/v19/customers/{customerId}/googleAds:search
        const query = `
            SELECT segments.date, campaign.id, campaign.name, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value
            FROM campaign
            WHERE segments.date DURING LAST_30_DAYS
        `

        const headers: Record<string, string> = {
            'Authorization': `Bearer ${accessToken}`,
            'developer-token': developerToken,
            'Content-Type': 'application/json'
        }
        if (managerId) headers['login-customer-id'] = managerId

        const response = await fetch(`https://googleads.googleapis.com/v19/customers/${customerId}/googleAds:search`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ query })
        })

        if (!response.ok) {
            const errText = await response.text()
            console.error('Google Ads Sync API Error:', response.status, errText)
            return res.status(response.status).json({ error: 'Failed to fetch from Google Ads API', details: errText })
        }

        const data = await response.json()
        const rows = data.results || []

        let processed = 0
        const dailySpends: Record<string, number> = {}

        for (const row of rows) {
            const dateStr = row.segments?.date || new Date().toISOString().split('T')[0]
            const spendMicros = parseInt(row.metrics?.costMicros || '0')
            const spend = spendMicros / 1000000 // Convert micros to currency unit

            dailySpends[dateStr] = (dailySpends[dateStr] || 0) + spend

            await prisma.adSpend.upsert({
                where: { workspaceId_platform_campaignId_date: { workspaceId, platform: 'GOOGLE', campaignId: row.campaign?.id?.toString() || '', date: new Date(dateStr) } },
                update: {
                    campaignName: row.campaign?.name || 'Unknown',
                    spend,
                    impressions: parseInt(row.metrics?.impressions || '0'),
                    clicks: parseInt(row.metrics?.clicks || '0'),
                    conversions: parseInt(row.metrics?.conversions || '0'),
                    conversionValue: parseFloat(row.metrics?.conversionsValue || '0')
                },
                create: {
                    workspaceId,
                    platform: 'GOOGLE',
                    campaignId: row.campaign?.id?.toString() || '',
                    campaignName: row.campaign?.name || 'Unknown',
                    spend,
                    impressions: parseInt(row.metrics?.impressions || '0'),
                    clicks: parseInt(row.metrics?.clicks || '0'),
                    conversions: parseInt(row.metrics?.conversions || '0'),
                    conversionValue: parseFloat(row.metrics?.conversionsValue || '0'),
                    date: new Date(dateStr)
                }
            })
            processed++
        }

        // Update DailyMetrics
        for (const [dateStr, spend] of Object.entries(dailySpends)) {
            await upsertDailyMetric(workspaceId, new Date(dateStr), 'googleAdSpend', spend)
        }

        await invalidateWorkspaceCache(workspaceId)

        await prisma.integration.update({
            where: { id: integration.id },
            data: { lastSync: new Date(), status: 'Connected' }
        })

        await createAuditLog({
            workspaceId,
            source: 'GOOGLE',
            event: 'Sync',
            status: '200 OK',
            message: `Sincronizadas ${processed} analíticas de campañas de Google Ads.`
        })

        return res.status(200).json({ success: true, count: processed })
    } catch (error) {
        console.error('Google Ads Sync Error:', error)
        return res.status(500).json({ error: 'Internal server error while syncing Google Ads' })
    }
})

router.get('/campaigns', authenticate, cacheMiddleware(CACHE_TTL.MINUTE_5), async (req: AuthRequest, res) => {
    try {
        const workspaceId = req.user?.workspaceId
        if (!workspaceId) return res.status(400).json({ error: 'Workspace required' })

        const { from, to } = req.query
        const dateFilter = from && to ? {
            date: {
                gte: new Date(from as string),
                lte: new Date(to as string)
            }
        } : {}

        // Group AdSpend for GOOGLE platform
        const campaigns = await prisma.adSpend.groupBy({
            by: ['campaignId', 'campaignName'],
            where: {
                workspaceId,
                platform: 'GOOGLE',
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
                status: 'Active',
                spend: spend,
                cpa: conversions > 0 ? spend / conversions : 0,
                roas: spend > 0 ? conversionValue / spend : 0,
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
                gte: new Date(from as string),
                lte: new Date(to as string)
            }
        } : {}

        const rows = await prisma.adSpend.groupBy({
            by: ['date'],
            where: { workspaceId, platform: 'GOOGLE', ...dateFilter },
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

// 3. GET /google/search-terms
router.get('/search-terms', authenticate, cacheMiddleware(CACHE_TTL.HOUR_1), async (req: AuthRequest, res) => {
    try {
        const workspaceId = req.user?.workspaceId
        if (!workspaceId) return res.status(400).json({ error: 'Workspace required' })

        // Mock Search Terms for now until real API call is implemented
        // In a real scenario, this would query Google Ads API for search_term_view
        const terms = [
            { query: "metria metrics software", category: "Brand Search", conversions: 12, cpa: 2.10, status: 'trending' },
            { query: "profit tracking e-commerce", category: "Generic Search", conversions: 8, cpa: 15.40, status: 'stable' },
            { query: "shopify google ads integration", category: "Long tail", conversions: 5, cpa: 8.90, status: 'low' },
            { query: "automatic marketing reports", category: "Generic Search", conversions: 3, cpa: 12.50, status: 'new' }
        ]

        return res.status(200).json(terms)
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' })
    }
})

export default router
