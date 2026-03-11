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
                // Fetch basic shop info to validate tokens
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
