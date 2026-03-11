import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { prisma } from '../lib/prisma'
import 'dotenv/config'
import { authenticate, AuthRequest } from '../middleware/auth'

const router = Router()
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-in-prod'

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' })
        }

        // Real DB check
        const user = await prisma.user.findUnique({
            where: { email },
            include: { workspace: true }
        })

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' })
        }

        // Not using bcrypt for simplicity in this demo, standard text compare
        if (user.passwordHash !== password) {
            return res.status(401).json({ error: 'Invalid credentials' })
        }

        // Check if forced password change is needed
        if (user.mustChangePassword) {
            const tempToken = jwt.sign(
                { id: user.id, email: user.email, role: user.role, mustChangePassword: true, workspaceId: user.workspaceId },
                JWT_SECRET,
                { expiresIn: '15m' }
            )
            return res.status(200).json({ requiresPasswordChange: true, token: tempToken })
        }

        // Check workspace status
        if (user.role !== 'SUPER_ADMIN' && user.workspace?.status === 'SUSPENDED') {
            return res.status(403).json({ error: 'Account suspended. Please contact support.' })
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, name: user.name, role: user.role, workspaceId: user.workspaceId },
            JWT_SECRET,
            { expiresIn: '7d' }
        )

        res.status(200).json({
            token,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                workspaceId: user.workspaceId
            },
            workspace: user.workspace ? { status: user.workspace.status } : undefined
        })
    } catch (error) {
        console.error('Login error:', error)
        res.status(500).json({ error: 'Internal server error' })
    }
})

router.post('/force-change-password', authenticate, async (req: AuthRequest, res) => {
    try {
        const { newPassword } = req.body
        const userReq = req.user as any

        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' })
        }

        if (!userReq.mustChangePassword) {
            return res.status(400).json({ error: 'No password change required' })
        }

        const user = await prisma.user.findUnique({ where: { id: userReq.id } })
        if (!user) return res.status(404).json({ error: 'User not found' })

        await prisma.user.update({
            where: { id: user.id },
            data: {
                passwordHash: newPassword,
                mustChangePassword: false
            }
        })

        const token = jwt.sign(
            { id: user.id, email: user.email, name: user.name, role: user.role, workspaceId: user.workspaceId },
            JWT_SECRET,
            { expiresIn: '7d' }
        )

        res.status(200).json({
            message: 'Password updated successfully',
            token,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                workspaceId: user.workspaceId
            }
        })
    } catch (error) {
        console.error('Password change error:', error)
        res.status(500).json({ error: 'Internal server error' })
    }
})

export default router
