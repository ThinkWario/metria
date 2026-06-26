import { Router } from 'express'
import { authenticate, AuthRequest } from '../middleware/auth'
import { prisma } from '../lib/prisma'
import {
    getGlobalSettings,
    updateGlobalSettings,
    getIntegrations,
    updateIntegration
} from '../controllers/settingsController'
import { requireRole } from '../middleware/roleAuth'

const router = Router()

router.get('/global', requireRole(['SUPER_ADMIN', 'ADMIN', 'VIEWER']), getGlobalSettings)
router.post('/global', requireRole(['SUPER_ADMIN', 'ADMIN']), updateGlobalSettings)
router.get('/integrations', requireRole(['SUPER_ADMIN', 'ADMIN', 'VIEWER']), getIntegrations)
router.post('/integrations', requireRole(['SUPER_ADMIN', 'ADMIN']), updateIntegration)

// DELETE /api/settings/integrations/:platform — disconnect an integration + its channels
router.delete('/integrations/:platform', requireRole(['SUPER_ADMIN', 'ADMIN']), async (req: AuthRequest, res: any) => {
    try {
        const workspaceId = req.user!.workspaceId!
        const platform = req.params.platform.toLowerCase()

        await prisma.integration.deleteMany({ where: { workspaceId, platform } })

        // For Meta: also remove Instagram and Messenger channels
        if (platform === 'meta') {
            await prisma.channel.deleteMany({
                where: { workspaceId, platform: { in: ['INSTAGRAM', 'MESSENGER'] } }
            })
        }

        res.json({ ok: true })
    } catch (error) {
        console.error('Delete integration error:', error)
        res.status(500).json({ error: 'Internal server error' })
    }
})

// --- Workspace Logo ---

// GET /api/settings/logo — Get workspace logo
router.get('/logo', authenticate, async (req: AuthRequest, res) => {
    try {
        const workspace = await prisma.workspace.findUnique({
            where: { id: req.user!.workspaceId as string },
            select: { logoUrl: true },
        })
        res.json({ logoUrl: workspace?.logoUrl || null })
    } catch (error) {
        console.error('Get logo error:', error)
        res.status(500).json({ error: 'Internal server error' })
    }
})

// POST /api/settings/logo — Upload workspace logo (ADMIN only, base64 data URL)
router.post('/logo', requireRole(['SUPER_ADMIN', 'ADMIN']), async (req: AuthRequest, res: any) => {
    try {

        const { logoUrl } = req.body
        if (!logoUrl || typeof logoUrl !== 'string') {
            return res.status(400).json({ error: 'logoUrl is required (base64 data URL)' })
        }

        // Enforce ~2MB limit for base64 string
        if (logoUrl.length > 2_800_000) {
            return res.status(400).json({ error: 'Logo file exceeds 2MB limit' })
        }

        const workspace = await prisma.workspace.update({
            where: { id: req.user!.workspaceId as string },
            data: { logoUrl },
            select: { logoUrl: true },
        })
        res.json(workspace)
    } catch (error) {
        console.error('Upload logo error:', error)
        res.status(500).json({ error: 'Internal server error' })
    }
})

// DELETE /api/settings/logo — Remove workspace logo (ADMIN only)
router.delete('/logo', requireRole(['SUPER_ADMIN', 'ADMIN']), async (req: AuthRequest, res: any) => {
    try {

        await prisma.workspace.update({
            where: { id: req.user!.workspaceId as string },
            data: { logoUrl: null },
        })
        res.json({ message: 'Logo removed successfully' })
    } catch (error) {
        console.error('Delete logo error:', error)
        res.status(500).json({ error: 'Internal server error' })
    }
})

// --- Workspace Branding ---

// GET /api/settings/branding — return primaryColor + brandName + logoUrl
router.get('/branding', authenticate, async (req: AuthRequest, res: any) => {
    try {
        const workspaceId = req.user!.workspaceId!
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { name: true, logoUrl: true, primaryColor: true, brandName: true }
        })
        res.json(workspace ?? {})
    } catch (error) {
        console.error('Get branding error:', error)
        res.status(500).json({ error: 'Internal server error' })
    }
})

// PATCH /api/settings/branding — update primaryColor and/or brandName
router.patch('/branding', requireRole(['SUPER_ADMIN', 'ADMIN']), async (req: AuthRequest, res: any) => {
    try {
        const workspaceId = req.user!.workspaceId!
        const { primaryColor, brandName } = req.body

        const data: Record<string, unknown> = {}
        if (primaryColor !== undefined) {
            if (typeof primaryColor !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(primaryColor)) {
                return res.status(400).json({ error: 'primaryColor must be a valid hex color (#RRGGBB)' })
            }
            data.primaryColor = primaryColor
        }
        if (brandName !== undefined) {
            if (typeof brandName !== 'string' || brandName.length > 60) {
                return res.status(400).json({ error: 'brandName must be a string under 60 chars' })
            }
            data.brandName = brandName.trim() || null
        }

        const updated = await prisma.workspace.update({
            where: { id: workspaceId },
            data,
            select: { name: true, logoUrl: true, primaryColor: true, brandName: true }
        })
        res.json(updated)
    } catch (error) {
        console.error('Update branding error:', error)
        res.status(500).json({ error: 'Internal server error' })
    }
})

export default router

