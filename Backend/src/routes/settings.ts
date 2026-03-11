import { Router } from 'express'
import { authenticate, AuthRequest } from '../middleware/auth'
import { prisma } from '../lib/prisma'
import {
    getGlobalSettings,
    updateGlobalSettings,
    getIntegrations,
    updateIntegration
} from '../controllers/settingsController'

const router = Router()

router.get('/global', authenticate, getGlobalSettings)
router.post('/global', authenticate, updateGlobalSettings)
router.get('/integrations', authenticate, getIntegrations)
router.post('/integrations', authenticate, updateIntegration)

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
router.post('/logo', authenticate, async (req: AuthRequest, res) => {
    try {
        if (req.user!.role !== 'ADMIN' && req.user!.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ error: 'Only ADMIN users can upload the workspace logo' })
        }

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
router.delete('/logo', authenticate, async (req: AuthRequest, res) => {
    try {
        if (req.user!.role !== 'ADMIN' && req.user!.role !== 'SUPER_ADMIN') {
            return res.status(403).json({ error: 'Only ADMIN users can remove the workspace logo' })
        }

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

export default router

