import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { prisma } from '../lib/prisma'
import 'dotenv/config'
import { authenticate, AuthRequest } from '../middleware/auth'
import bcrypt from 'bcrypt'
import { OAuth2Client } from 'google-auth-library'
import { sendWelcomeEmail } from '../lib/mailer'

const router = Router()
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-in-prod'
const googleClient = new OAuth2Client(process.env.GOOGLE_ADS_CLIENT_ID)

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

        if (!user.passwordHash) {
            return res.status(401).json({ error: 'This account uses Google Login. Please sign in with Google.' })
        }

        const isMatch = await bcrypt.compare(password, user.passwordHash)
        if (!isMatch) {
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
            { 
                id: user.id, 
                email: user.email, 
                name: user.name, 
                role: user.role, 
                workspaceId: user.workspaceId,
                subscriptionStatus: user.workspace?.subscriptionStatus 
            },
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

router.post('/google', async (req, res) => {
    try {
        const { credential } = req.body

        if (!credential) {
            return res.status(400).json({ error: 'Credential token is required' })
        }

        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_ADS_CLIENT_ID
        })

        const payload = ticket.getPayload()
        if (!payload || !payload.email) {
            return res.status(401).json({ error: 'Invalid google token' })
        }

        const { email, name, picture, sub: googleId } = payload

        // Find user by googleId or email
        let user = await prisma.user.findFirst({
            where: {
                OR: [
                    { googleId },
                    { email }
                ]
            },
            include: { workspace: true }
        })

        let onboardingRequired = false

        // If user doesn't exist, create them WITH a workspace (they will choose a plan later, but they need an ID)
        if (!user) {
            console.log(`[GoogleAuth] Creating new user and workspace for ${email}`)
            
            const workspace = await prisma.workspace.create({
                data: {
                    name: name ? `${name}'s Workspace` : 'Mi Espacio',
                    plan: 'STARTER',
                    subscriptionStatus: 'INCOMPLETE'
                }
            })

            user = await prisma.user.create({
                data: {
                    email,
                    name,
                    googleId,
                    avatarUrl: picture,
                    role: 'ADMIN',
                    workspaceId: workspace.id,
                },
                include: { workspace: true }
            })
            onboardingRequired = true
            sendWelcomeEmail(email, name ?? email).catch(() => {})
            console.log(`[GoogleAuth] New user created with workspace ${workspace.id}. onboardingRequired=${onboardingRequired}`)
        } else if (!user.googleId) {
            console.log(`[GoogleAuth] Linking Google account to existing user ${email}`)
            user = await prisma.user.update({
                where: { id: user.id },
                data: { googleId, avatarUrl: picture || user.avatarUrl },
                include: { workspace: true }
            })
        }

        // Ensure user has a workspace even if they existed but didn't have one
        if (!user.workspaceId) {
            console.log(`[GoogleAuth] User ${email} has no workspace, creating one...`)
            const workspace = await prisma.workspace.create({
                data: {
                    name: user.name ? `${user.name}'s Workspace` : 'Mi Espacio',
                    plan: 'STARTER',
                    subscriptionStatus: 'INCOMPLETE'
                }
            })

            user = await prisma.user.update({
                where: { id: user.id },
                data: { workspaceId: workspace.id, role: 'ADMIN' },
                include: { workspace: true }
            })
            onboardingRequired = true
            console.log(`[GoogleAuth] Workspace ${workspace.id} created for existing user.`)
        }

        // Check workspace status
        if (user.workspaceId && user.role !== 'SUPER_ADMIN' && user.workspace?.status === 'SUSPENDED') {
            return res.status(403).json({ error: 'Account suspended. Please contact support.' })
        }

        const token = jwt.sign(
            { 
                id: user.id, 
                email: user.email, 
                name: user.name, 
                role: user.role, 
                workspaceId: user.workspaceId,
                subscriptionStatus: user.workspace?.subscriptionStatus 
            },
            JWT_SECRET,
            { expiresIn: '7d' }
        )

        res.status(200).json({
            token,
            onboardingRequired,
            trialUsed: !!user.trialUsedAt,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
                workspaceId: user.workspaceId,
                name: user.name,
                avatarUrl: user.avatarUrl
            },
            workspace: user.workspace ? { status: user.workspace.status } : undefined
        })
    } catch (error: any) {
        console.error('Google login error detail:', error.message || error)
        res.status(500).json({ error: 'Failed to authenticate with Google', details: error.message })
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

        const user = await prisma.user.findUnique({ 
            where: { id: userReq.id },
            include: { workspace: true }
        })
        if (!user) return res.status(404).json({ error: 'User not found' })

        const hashed = await bcrypt.hash(newPassword, 10)

        await prisma.user.update({
            where: { id: user.id },
            data: {
                passwordHash: hashed,
                mustChangePassword: false
            }
        })

        const token = jwt.sign(
            { 
                id: user.id, 
                email: user.email, 
                name: user.name, 
                role: user.role, 
                workspaceId: user.workspaceId,
                subscriptionStatus: user.workspace?.subscriptionStatus 
            },
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

router.post('/register', async (req, res) => {
    try {
        const { workspaceName, name, email, password } = req.body

        if (!workspaceName || !name || !email || !password) {
            return res.status(400).json({ error: 'Todos los campos son requeridos' })
        }
        if (password.length < 8) {
            return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' })
        }

        const existing = await prisma.user.findUnique({ where: { email } })
        if (existing) {
            return res.status(409).json({ error: 'Este email ya está registrado' })
        }

        const workspace = await prisma.workspace.create({ data: { name: workspaceName } })
        const passwordHash = await bcrypt.hash(password, 10)
        const user = await prisma.user.create({
            data: { email, name, passwordHash, role: 'ADMIN', workspaceId: workspace.id }
        })

        sendWelcomeEmail(email, name).catch(() => {})

        const token = jwt.sign(
            { 
                id: user.id, 
                email: user.email, 
                name: user.name, 
                role: user.role, 
                workspaceId: workspace.id,
                subscriptionStatus: workspace.subscriptionStatus 
            },
            JWT_SECRET,
            { expiresIn: '7d' }
        )

        return res.status(201).json({
            token,
            user: { id: user.id, email, role: 'ADMIN', workspaceId: workspace.id }
        })
    } catch (error) {
        console.error('Register error:', error)
        return res.status(500).json({ error: 'Internal server error' })
    }
})

export default router
