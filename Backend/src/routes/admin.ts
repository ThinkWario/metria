import { Router } from 'express'
import { prisma } from '../lib/prisma'
import jwt from 'jsonwebtoken'
import { requireSuperAdmin } from '../middleware/adminAuth'
import 'dotenv/config'
import bcrypt from 'bcrypt'
const router = Router()
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-in-prod'

// Apply Super Admin protection to all routes in this file
router.use(requireSuperAdmin)

// --- Workspaces Management ---

// List all workspaces with basic stats and performance insights
router.get('/workspaces', async (req, res) => {
    try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const workspaces = await prisma.workspace.findMany({
            include: {
                integrations: {
                    select: { platform: true, status: true, lastSync: true }
                },
                dailyMetrics: {
                    where: {
                        date: { gte: sevenDaysAgo }
                    },
                    select: { totalRevenue: true, netProfit: true }
                },
                _count: {
                    select: { users: true, orders: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        })

        // Summarize metrics per workspace
        const enriched = workspaces.map(ws => {
            const metrics7d = ws.dailyMetrics.reduce((acc, m) => ({
                revenue: acc.revenue + Number(m.totalRevenue || 0),
                profit: acc.profit + Number(m.netProfit || 0)
            }), { revenue: 0, profit: 0 })

            return {
                ...ws,
                dailyMetrics: undefined, // remove raw array to keep payload lean
                metrics7d
            }
        })

        res.status(200).json(enriched)
    } catch (error) {
        console.error('Error fetching workspaces:', error)
        res.status(500).json({ error: 'Internal server error' })
    }
})

// Create a new workspace and its initial admin user
router.post('/workspaces', async (req, res) => {
    try {
        const { name, adminEmail } = req.body

        if (!name || !adminEmail) {
            return res.status(400).json({ error: 'Workspace name and admin email are required' })
        }

        const existingUser = await prisma.user.findUnique({ where: { email: adminEmail } })
        if (existingUser) {
            return res.status(400).json({ error: 'A user with this email already exists' })
        }

        const tempPassword = 'ChangeMe2026!'
        const hashedTempPassword = await bcrypt.hash(tempPassword, 10)

        // Create Workspace and User transactionally
        const workspace = await prisma.$transaction(async (tx) => {
            const newWorkspace = await tx.workspace.create({
                data: { name }
            })

            await tx.user.create({
                data: {
                    email: adminEmail,
                    passwordHash: hashedTempPassword,
                    name: 'Admin',
                    role: 'ADMIN',
                    workspaceId: newWorkspace.id,
                    mustChangePassword: true
                }
            })

            return newWorkspace
        })

        res.status(201).json({
            message: 'Workspace created successfully',
            workspace,
            adminEmail,
            tempPassword
        })

    } catch (error) {
        console.error('Error creating workspace:', error)
        res.status(500).json({ error: 'Internal server error' })
    }
})

// Toggle Workspace Status (Active / Suspended)
router.post('/workspaces/:id/toggle', async (req, res) => {
    try {
        const { id } = req.params
        const workspace = await prisma.workspace.findUnique({ where: { id } })

        if (!workspace) {
            return res.status(404).json({ error: 'Workspace not found' })
        }

        const newStatus = workspace.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'

        const updated = await prisma.workspace.update({
            where: { id },
            data: { status: newStatus }
        })

        res.status(200).json(updated)
    } catch (error) {
        console.error('Error toggling workspace:', error)
        res.status(500).json({ error: 'Internal server error' })
    }
})

// Impersonate a workspace (Generate a scoped JWT for a target workspace)
router.post('/workspaces/impersonate', async (req, res) => {
    try {
        const { targetWorkspaceId } = req.body
        const userReq = (req as any).user // the super admin calling this

        if (!targetWorkspaceId) {
            return res.status(400).json({ error: 'targetWorkspaceId is required' })
        }

        const workspace = await prisma.workspace.findUnique({ where: { id: targetWorkspaceId } })

        if (!workspace) {
            return res.status(404).json({ error: 'Workspace not found' })
        }

        // Issue a special JWT that identifies the admin but binds them to the target workspace
        const token = jwt.sign(
            {
                id: userReq.id,
                email: userReq.email,
                role: 'SUPER_ADMIN',
                workspaceId: targetWorkspaceId,
                isImpersonating: true
            },
            JWT_SECRET,
            { expiresIn: '1h' } // Short lived token for security
        )

        res.status(200).json({ token, workspaceName: workspace.name })
    } catch (error) {
        console.error('Error impersonating workspace:', error)
        res.status(500).json({ error: 'Internal server error' })
    }
})

// Stop impersonating and return to true SUPER_ADMIN context
router.post('/workspaces/impersonate/stop', async (req, res) => {
    try {
        const userReq = (req as any).user // the super admin calling this

        if (!userReq.isImpersonating) {
            return res.status(400).json({ error: 'You are not currenty impersonating a workspace' })
        }

        const realUser = await prisma.user.findUnique({ where: { id: userReq.id } })

        if (!realUser) {
            return res.status(404).json({ error: 'User not found' })
        }

        const token = jwt.sign(
            {
                id: realUser.id,
                email: realUser.email,
                name: realUser.name,
                role: realUser.role,
                workspaceId: realUser.workspaceId,
            },
            JWT_SECRET,
            { expiresIn: '7d' }
        )

        res.status(200).json({ token })
    } catch (error) {
        console.error('Error stopping impersonation:', error)
        res.status(500).json({ error: 'Internal server error' })
    }
})


// --- Users Management ---

// Get users for a specific workspace (or all if not specified)
router.get('/users', async (req, res) => {
    try {
        const { workspaceId } = req.query
        const users = await prisma.user.findMany({
            where: workspaceId ? { workspaceId: String(workspaceId) } : undefined,
            select: {
                id: true, email: true, name: true, role: true, workspaceId: true, mustChangePassword: true, createdAt: true
            }
        })
        res.status(200).json(users)
    } catch (error) {
        console.error('Error fetching users:', error)
        res.status(500).json({ error: 'Internal server error' })
    }
})

// Reset a user's password to a generic string and force a change
router.post('/users/:id/reset-password', async (req, res) => {
    try {
        const { id } = req.params
        // We use a simple generic password for demo purposes. 
        // In a real app this might be randomly generated and emailed.
        const genericPassword = 'ChangeMe2026!'
        const hashedGenericPassword = await bcrypt.hash(genericPassword, 10)

        const updated = await prisma.user.update({
            where: { id },
            data: {
                passwordHash: hashedGenericPassword,
                mustChangePassword: true
            },
            select: { id: true, email: true, mustChangePassword: true }
        })

        res.status(200).json({
            message: 'Password reset successfully. The user must change it on next login.',
            user: updated,
            temporaryPassword: genericPassword
        })
    } catch (error) {
        console.error('Error resetting password:', error)
        res.status(500).json({ error: 'Internal server error' })
    }
})


// --- System Configurations Management ---

router.get('/settings', async (req, res) => {
    try {
        const configs = await prisma.systemConfig.findMany()
        res.status(200).json(configs)
    } catch (error) {
        console.error('Error fetching system configs:', error)
        res.status(500).json({ error: 'Internal server error' })
    }
})

router.post('/settings', async (req, res) => {
    try {
        const { key, value } = req.body
        if (!key || typeof value !== 'string') {
            return res.status(400).json({ error: 'Key and string value are required' })
        }

        const upserted = await prisma.systemConfig.upsert({
            where: { key },
            update: { value },
            create: { key, value }
        })

        res.status(200).json(upserted)
    } catch (error) {
        console.error('Error saving system config:', error)
        res.status(500).json({ error: 'Internal server error' })
    }
})

export default router
