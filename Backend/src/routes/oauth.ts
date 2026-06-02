import { Router } from 'express'
import { authenticate, AuthRequest } from '../middleware/auth'
import { OAuthManager } from '../lib/oauth/manager'
import { prisma } from '../lib/prisma'
import { createAuditLog } from '../lib/logger'

const router = Router()

/**
 * GET /api/oauth/:platform
 * Redirects the user to the provider's consent screen.
 */
router.get('/:platform', authenticate, async (req: AuthRequest, res) => {
    try {
        const { platform } = req.params
        const workspaceId = req.user?.workspaceId
        const { shop } = req.query // For Shopify

        if (!workspaceId) return res.status(400).json({ error: 'Auth required' })

        const provider = OAuthManager.getProvider(platform)
        
        // Encode state with workspaceId and optional shop domain
        const stateData: Record<string, string> = { workspaceId }
        if (shop) stateData.shop = shop as string
        const state = Buffer.from(JSON.stringify(stateData)).toString('base64')

        const authUrl = provider.getAuthUrl(state)
        res.redirect(authUrl)
    } catch (error: any) {
        res.status(400).json({ error: error.message })
    }
})

/**
 * GET /api/oauth/:platform/callback
 * Handles the redirect back from the provider.
 */
router.get('/:platform/callback', async (req, res) => {
    try {
        const { platform } = req.params
        const { code, state } = req.query

        if (!code || !state) {
            return res.status(400).json({ error: 'Missing code or state' })
        }

        // Decode state
        const stateData = JSON.parse(Buffer.from(state as string, 'base64').toString())
        const { workspaceId, shop } = stateData

        if (!workspaceId) throw new Error('Invalid state: missing workspaceId')

        const provider = OAuthManager.getProvider(platform)
        
        // Context for Shopify provider (hacky but works for now)
        if (platform === 'shopify') (global as any).currentShopContext = shop

        const tokens = await provider.exchangeCode(
            code as string, 
            `${process.env.BACKEND_URL}/api/oauth/${platform}/callback`
        )

        // Save to Integration table
        const integrationName = platform.charAt(0).toUpperCase() + platform.slice(1)
        
        await prisma.integration.upsert({
            where: { workspaceId_platform: { workspaceId, platform: platform.toLowerCase() } },
            update: {
                status: 'Connected',
                config: {
                    ...tokens.providerData,
                    accessToken: tokens.accessToken,
                    refreshToken: tokens.refreshToken,
                    expiresAt: tokens.expiresAt,
                    lastSync: new Date()
                }
            },
            create: {
                workspaceId,
                platform: platform.toLowerCase(),
                name: integrationName,
                type: 'AD_ACCOUNT',
                status: 'Connected',
                config: {
                    ...tokens.providerData,
                    accessToken: tokens.accessToken,
                    refreshToken: tokens.refreshToken,
                    expiresAt: tokens.expiresAt
                }
            }
        })

        await createAuditLog({
            workspaceId,
            source: platform.toUpperCase(),
            event: 'OAuth_Connect',
            status: 'Success',
            message: `Account connected successfully via OAuth.`
        })

        // Redirect back to frontend settings
        res.redirect(`${process.env.FRONTEND_URL}/dashboard/settings?tab=integrations&success=true&platform=${platform}`)
    } catch (error: any) {
        console.error(`OAuth Callback Error (${req.params.platform}):`, error)
        res.redirect(`${process.env.FRONTEND_URL}/dashboard/settings?tab=integrations&error=${encodeURIComponent(error.message)}`)
    }
})

export default router
