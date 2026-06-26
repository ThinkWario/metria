import { Router } from 'express'
import { authenticate, AuthRequest } from '../middleware/auth'
import { OAuthManager } from '../lib/oauth/manager'
import { prisma } from '../lib/prisma'
import { createAuditLog } from '../lib/logger'
import { upsertChannelConfig } from '../modules/messaging/channel.service'

const router = Router()

// OAuth redirect flows can't set headers, so accept ?token= as fallback
router.use((req, _res, next) => {
    if (req.query.token && !req.headers.authorization) {
        req.headers.authorization = `Bearer ${req.query.token}`
    }
    next()
})

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

        const config: Record<string, any> = {
            ...tokens.providerData,
            accessToken: tokens.accessToken,
            expiresAt: tokens.expiresAt,
        }
        if (tokens.refreshToken) config.refreshToken = tokens.refreshToken

        // For Meta: auto-fetch ad accounts + pages to provision everything from one login
        let needsAdAccount = false
        let metaPageId: string | undefined
        let metaPageToken: string | undefined
        let metaInstagramId: string | undefined
        if (platform === 'meta') {
            // 1. Ad accounts
            try {
                const adRes = await fetch(
                    `https://graph.facebook.com/v19.0/me/adaccounts?fields=id,name&access_token=${tokens.accessToken}`
                )
                if (adRes.ok) {
                    const adData = await adRes.json() as { data?: Array<{ id: string; name: string }> }
                    const accounts = adData.data ?? []
                    if (accounts.length === 1) {
                        config.adAccountId = accounts[0].id.replace('act_', '')
                    } else if (accounts.length > 1) {
                        config.adAccountsList = JSON.stringify(
                            accounts.map(a => ({ id: a.id.replace('act_', ''), name: a.name }))
                        )
                        needsAdAccount = true
                    } else {
                        needsAdAccount = true
                    }
                } else {
                    needsAdAccount = true
                }
            } catch {
                needsAdAccount = true
            }

            // 2. Pages + Instagram accounts (for Messenger & Instagram messaging)
            try {
                const pagesRes = await fetch(
                    `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${tokens.accessToken}`
                )
                if (pagesRes.ok) {
                    const pagesData = await pagesRes.json() as {
                        data?: Array<{
                            id: string
                            name: string
                            access_token: string
                            instagram_business_account?: { id: string }
                        }>
                    }
                    const pages = pagesData.data ?? []
                    if (pages.length > 0) {
                        const page = pages[0]
                        metaPageId = page.id
                        metaPageToken = page.access_token
                        metaInstagramId = page.instagram_business_account?.id
                        config.pageId = page.id
                        config.pageAccessToken = page.access_token
                        if (metaInstagramId) config.instagramAccountId = metaInstagramId
                    }
                }
            } catch {
                // Non-fatal — channels can be configured manually
            }
        }

        await prisma.integration.upsert({
            where: { workspaceId_platform: { workspaceId, platform: platform.toLowerCase() } },
            update: { status: 'Connected', config },
            create: {
                workspaceId,
                platform: platform.toLowerCase(),
                name: integrationName,
                type: 'AD_ACCOUNT',
                status: 'Connected',
                config,
            }
        })

        // Auto-provision Instagram + Messenger channels from the page token
        if (platform === 'meta' && metaPageId && metaPageToken) {
            try {
                await upsertChannelConfig(workspaceId, {
                    platform: 'INSTAGRAM',
                    name: 'Instagram',
                    config: {
                        pageAccessToken: metaPageToken,
                        pageId: metaPageId,
                        verifyToken: process.env.META_INSTAGRAM_VERIFY_TOKEN ?? 'metria-instagram-verify',
                        ...(metaInstagramId ? { instagramAccountId: metaInstagramId } : {}),
                    }
                })
                await upsertChannelConfig(workspaceId, {
                    platform: 'MESSENGER',
                    name: 'Messenger',
                    config: {
                        pageAccessToken: metaPageToken,
                        pageId: metaPageId,
                        verifyToken: process.env.META_MESSENGER_VERIFY_TOKEN ?? 'metria-messenger-verify',
                    }
                })
            } catch (err) {
                console.error('Meta: failed to auto-provision messaging channels', err)
            }
        }

        await createAuditLog({
            workspaceId,
            source: platform.toUpperCase(),
            event: 'OAuth_Connect',
            status: 'Success',
            message: `Account connected successfully via OAuth.`
        })

        const redirectParams = new URLSearchParams({ tab: 'integrations', success: 'true', platform })
        if (needsAdAccount) redirectParams.set('needsAdAccount', 'true')

        res.redirect(`${process.env.FRONTEND_URL}/dashboard/settings?${redirectParams.toString()}`)
    } catch (error: any) {
        console.error(`OAuth Callback Error (${req.params.platform}):`, error)
        res.redirect(`${process.env.FRONTEND_URL}/dashboard/settings?tab=integrations&error=${encodeURIComponent(error.message)}`)
    }
})

export default router
