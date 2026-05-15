import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth'
import jwt from 'jsonwebtoken'

const router = Router()
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-in-prod'

router.post('/select-plan', authenticate, async (req: AuthRequest, res) => {
    try {
        const { planType, workspaceName } = req.body
        const userId = (req.user as any).id

        if (!planType || !['STARTER', 'PRO', 'SCALE'].includes(planType)) {
            return res.status(400).json({ error: 'Invalid plan type' })
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { workspace: true }
        })

        if (!user) {
            return res.status(404).json({ error: 'User not found' })
        }

        // Check if trial has already been used
        if (planType === 'STARTER' && user.trialUsedAt) {
            return res.status(400).json({ error: 'Ya has utilizado tu periodo de prueba gratuito.' })
        }

        const trialDays = planType === 'STARTER' ? 7 : 0
        const trialEndsAt = trialDays > 0 ? new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000) : null
        const name = workspaceName || `${user.name || user.email.split('@')[0]}'s Workspace`

        let workspace;

        if (user.workspaceId) {
            // Update existing workspace
            workspace = await prisma.workspace.update({
                where: { id: user.workspaceId },
                data: {
                    name: workspaceName || undefined, // Only update if provided
                    plan: planType,
                    subscriptionStatus: planType === 'STARTER' ? 'TRIAL' : 'ACTIVE',
                    trialEndsAt,
                }
            })
        } else {
            // Create new workspace
            workspace = await prisma.workspace.create({
                data: {
                    name,
                    plan: planType,
                    subscriptionStatus: planType === 'STARTER' ? 'TRIAL' : 'ACTIVE',
                    trialEndsAt,
                    users: {
                        connect: { id: user.id }
                    }
                }
            })
        }

        // Update user role to ADMIN and mark trial as used if applicable
        await prisma.user.update({
            where: { id: user.id },
            data: { 
                role: 'ADMIN',
                workspaceId: workspace.id,
                trialUsedAt: planType === 'STARTER' ? new Date() : user.trialUsedAt
            }
        })

        // Generate new token with workspaceId
        const newToken = jwt.sign(
            { 
                id: user.id, 
                email: user.email, 
                name: user.name, 
                role: 'ADMIN', 
                workspaceId: workspace.id,
                subscriptionStatus: workspace.subscriptionStatus 
            },
            JWT_SECRET,
            { expiresIn: '7d' }
        )

        res.status(200).json({
            message: 'Workspace created successfully',
            token: newToken,
            workspace
        })

    } catch (error) {
        console.error('Onboarding error:', error)
        res.status(500).json({ error: 'Internal server error' })
    }
})

export default router
