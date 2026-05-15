import { Response } from 'express'
import { prisma } from '../lib/prisma'
import { AuthRequest } from '../middleware/auth'
import { createAuditLog } from '../lib/logger'

export const getGlobalSettings = async (req: AuthRequest, res: Response) => {
    try {
        const workspaceId = req.user?.workspaceId
        if (!workspaceId) return res.status(400).json({ error: 'Workspace required' })

        let settings = await prisma.globalSetting.findUnique({
            where: { workspaceId }
        })

        if (!settings) {
            settings = await prisma.globalSetting.create({
                data: { workspaceId }
            })
        }

        return res.status(200).json(settings)
    } catch (error) {
        console.error('getGlobalSettings Error:', error)
        return res.status(500).json({ error: 'Internal server error' })
    }
}

export const updateGlobalSettings = async (req: AuthRequest, res: Response) => {
    try {
        const workspaceId = req.user?.workspaceId
        if (!workspaceId) return res.status(400).json({ error: 'Workspace required' })

        const { timezone, currency, strictAttribution, taxRate, gatewayPercent, gatewayFixed, customFees } = req.body

        const settings = await prisma.globalSetting.upsert({
            where: { workspaceId },
            update: {
                timezone,
                currency,
                strictAttribution,
                taxRate,
                gatewayPercent,
                gatewayFixed,
                customFees
            },
            create: {
                workspaceId,
                timezone,
                currency,
                strictAttribution,
                taxRate: taxRate ?? 0,
                gatewayPercent: gatewayPercent ?? 0,
                gatewayFixed: gatewayFixed ?? 0,
                customFees: customFees ?? []
            }
        })

        return res.status(200).json(settings)
    } catch (error) {
        console.error('updateGlobalSettings Error:', error)
        return res.status(500).json({ error: 'Internal server error' })
    }
}

export const getIntegrations = async (req: AuthRequest, res: Response) => {
    try {
        const workspaceId = req.user?.workspaceId
        if (!workspaceId) return res.status(400).json({ error: 'Workspace required' })

        const integrations = await prisma.integration.findMany({
            where: { workspaceId }
        })

        return res.status(200).json(integrations)
    } catch (error) {
        console.error('getIntegrations Error:', error)
        return res.status(500).json({ error: 'Internal server error' })
    }
}

export const updateIntegration = async (req: AuthRequest, res: Response) => {
    try {
        const workspaceId = req.user?.workspaceId
        if (!workspaceId) return res.status(400).json({ error: 'Workspace required' })

        const { platform, name, type, config, status } = req.body

        if (!platform || !name || !type || !config) {
            return res.status(400).json({ error: 'Missing required configuration fields' })
        }

        // Test Shopify connection before saving
        if (platform === 'shopify') {
            const domain = (config as any).domain?.replace(/^https?:\/\//, '').replace(/\/$/, '')
            const accessToken = (config as any).accessToken
            if (!domain || !accessToken) {
                return res.status(400).json({ error: 'Missing domain or accessToken in Shopify config' })
            }
            try {
                const response = await fetch(`https://${domain}/admin/api/2024-01/shop.json`, {
                    headers: {
                        'X-Shopify-Access-Token': accessToken,
                        'Content-Type': 'application/json'
                    }
                })
                if (!response.ok) {
                    return res.status(400).json({ error: 'Invalid Shopify credentials. Connection test failed.' })
                }
            } catch (e) {
                return res.status(400).json({ error: 'Failed to connect to Shopify. Please check your domain.' })
            }
        }

        // Test TikTok Ads connection before saving
        if (platform === 'tiktok') {
            const accessToken = (config as any).accessToken?.trim()
            const adAccountId = (config as any).adAccountId?.trim()
            if (!accessToken || !adAccountId) {
                return res.status(400).json({ error: 'Missing Advertiser ID or Access Token in TikTok config' })
            }
            try {
                const params = new URLSearchParams({ advertiser_ids: JSON.stringify([adAccountId]) })
                const response = await fetch(`https://business-api.tiktok.com/open_api/v1.3/advertiser/info/?${params}`, {
                    headers: { 'Access-Token': accessToken }
                })
                const data = await response.json()
                if (data.code !== 0) {
                    return res.status(400).json({ error: `TikTok connection failed: ${data.message || 'Invalid credentials'}` })
                }
            } catch (e) {
                return res.status(400).json({ error: 'Failed to connect to TikTok Ads API.' })
            }
        }

        // Test Google Ads connection before saving
        if (platform === 'google') {
            const developerToken = (config as any).developerToken?.trim()
            const rawCustomerId = (config as any).customerId?.trim()
            const refreshToken = (config as any).refreshToken?.trim()
            const clientId = (config as any).clientId?.trim()
            const clientSecret = (config as any).clientSecret?.trim()

            if (!developerToken || !rawCustomerId) {
                return res.status(400).json({ error: 'Missing Customer ID or Developer Token in Google config' })
            }
            if (!refreshToken || !clientId || !clientSecret) {
                return res.status(400).json({ error: 'Missing OAuth credentials (Client ID, Client Secret, Refresh Token) in Google config' })
            }
            try {
                // Exchange refresh token to verify OAuth credentials
                const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        client_id: clientId,
                        client_secret: clientSecret,
                        refresh_token: refreshToken,
                        grant_type: 'refresh_token'
                    })
                })
                if (!tokenRes.ok) {
                    return res.status(400).json({ error: 'Google OAuth credentials are invalid. Token exchange failed.' })
                }
            } catch (e) {
                return res.status(400).json({ error: 'Failed to connect to Google Ads API.' })
            }
        }

        const integration = await prisma.integration.upsert({
            where: { workspaceId_platform: { workspaceId, platform } },
            update: {
                name,
                type,
                config,
                status: status || 'Connected',
                lastSync: new Date()
            },
            create: {
                workspaceId,
                platform,
                name,
                type,
                config,
                status: status || 'Connected',
                lastSync: new Date()
            }
        })
        
        await createAuditLog({
            workspaceId,
            source: platform.charAt(0).toUpperCase() + platform.slice(1),
            event: 'Connection Updated',
            status: '200 OK',
            message: `Plataforma ${name} configurada correctamente.`
        })

        return res.status(200).json(integration)
    } catch (error) {
        console.error('updateIntegration Error:', error)
        return res.status(500).json({ error: 'Internal server error' })
    }
}
