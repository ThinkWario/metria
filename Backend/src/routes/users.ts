import { Router } from 'express'
import { prisma } from '../lib/prisma'
import jwt from 'jsonwebtoken'
import 'dotenv/config'
import { authenticate, AuthRequest } from '../middleware/auth'
import bcrypt from 'bcrypt'
const router = Router()
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-in-prod'

// GET /api/users — List members of the authenticated user's workspace (for assignment dropdowns)
router.get('/', authenticate, async (req: AuthRequest, res) => {
    try {
        const workspaceId = req.user!.workspaceId
        if (!workspaceId) return res.json([])

        const users = await prisma.user.findMany({
            where: { workspaceId },
            select: { id: true, name: true, email: true, role: true, avatarUrl: true },
            orderBy: { name: 'asc' },
        })

        res.json(users)
    } catch (error) {
        console.error('List workspace users error:', error)
        res.status(500).json({ error: 'Internal server error' })
    }
})

// GET /api/users/me — Return authenticated user profile
router.get('/me', authenticate, async (req: AuthRequest, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user!.id },
            include: {
                workspace: true,
                preferences: true
            }
        })

        if (!user) {
            console.error('[/me] User not found in DB:', req.user!.id)
            return res.status(404).json({ error: 'User not found' })
        }

        // Remove sensitive data before returning
        const { passwordHash, ...safeUser } = user as any
        
        res.json({
            ...safeUser,
            isImpersonating: !!req.user!.isImpersonating
        })
    } catch (error: any) {
        console.error('Get profile detailed error:', {
            message: error.message,
            stack: error.stack,
            userId: req.user?.id
        })
        res.status(500).json({ error: 'Internal server error', detail: error.message })
    }
})

// PUT /api/users/me — Update user profile (name, phone)
router.put('/me', authenticate, async (req: AuthRequest, res) => {
    try {
        const { name, phone } = req.body

        const updated = await prisma.user.update({
            where: { id: req.user!.id },
            data: {
                ...(name !== undefined && { name }),
                ...(phone !== undefined && { phone }),
            },
            select: { id: true, name: true, email: true, phone: true, role: true },
        })

        // Re-issue token with updated name so sidebar/header reflect changes immediately
        const newToken = jwt.sign(
            { id: updated.id, email: updated.email, name: updated.name, role: updated.role, workspaceId: req.user!.workspaceId },
            JWT_SECRET,
            { expiresIn: '7d' }
        )

        res.json({ user: updated, token: newToken })
    } catch (error) {
        console.error('Update profile error:', error)
        res.status(500).json({ error: 'Internal server error' })
    }
})

// PUT /api/users/me/password — Change password (requires current password)
router.put('/me/password', authenticate, async (req: AuthRequest, res) => {
    try {
        const { currentPassword, newPassword } = req.body

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current and new passwords are required' })
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'New password must be at least 6 characters' })
        }

        const user = await prisma.user.findUnique({ where: { id: req.user!.id } })
        if (!user) return res.status(404).json({ error: 'User not found' })

        const isMatch = await bcrypt.compare(currentPassword, user.passwordHash!)
        if (!isMatch) {
            return res.status(401).json({ error: 'Current password is incorrect' })
        }

        const hashed = await bcrypt.hash(newPassword, 10)

        await prisma.user.update({
            where: { id: user.id },
            data: { passwordHash: hashed },
        })

        res.json({ message: 'Password updated successfully' })
    } catch (error) {
        console.error('Change password error:', error)
        res.status(500).json({ error: 'Internal server error' })
    }
})

// GET /api/users/me/preferences — Get user preferences (auto-create if absent)
router.get('/me/preferences', authenticate, async (req: AuthRequest, res) => {
    try {
        let prefs = await prisma.userPreference.findUnique({
            where: { userId: req.user!.id },
        })

        if (!prefs) {
            prefs = await prisma.userPreference.create({
                data: { userId: req.user!.id },
            })
        }

        res.json(prefs)
    } catch (error) {
        console.error('Get preferences error:', error)
        res.status(500).json({ error: 'Internal server error' })
    }
})

// PUT /api/users/me/preferences — Update user preferences
router.put('/me/preferences', authenticate, async (req: AuthRequest, res) => {
    try {
        const { theme, compactMode, emailReports, alertMarginLow, alertStockout, defaultDateRange } = req.body

        const prefs = await prisma.userPreference.upsert({
            where: { userId: req.user!.id },
            update: {
                ...(theme !== undefined && { theme }),
                ...(compactMode !== undefined && { compactMode }),
                ...(emailReports !== undefined && { emailReports }),
                ...(alertMarginLow !== undefined && { alertMarginLow }),
                ...(alertStockout !== undefined && { alertStockout }),
                ...(defaultDateRange !== undefined && { defaultDateRange }),
            },
            create: {
                userId: req.user!.id,
                ...(theme !== undefined && { theme }),
                ...(compactMode !== undefined && { compactMode }),
                ...(emailReports !== undefined && { emailReports }),
                ...(alertMarginLow !== undefined && { alertMarginLow }),
                ...(alertStockout !== undefined && { alertStockout }),
                ...(defaultDateRange !== undefined && { defaultDateRange }),
            },
        })

        res.json(prefs)
    } catch (error) {
        console.error('Update preferences error:', error)
        res.status(500).json({ error: 'Internal server error' })
    }
})

export default router
