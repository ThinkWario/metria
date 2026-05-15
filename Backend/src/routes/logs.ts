import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth'

const router = Router()

router.get('/', authenticate, async (req: AuthRequest, res) => {
    try {
        const workspaceId = req.user?.workspaceId
        if (!workspaceId) return res.status(400).json({ error: 'Workspace required' })

        const logs = await prisma.auditLog.findMany({
            where: { workspaceId },
            take: 50,
            orderBy: { createdAt: 'desc' }
        })

        res.status(200).json(logs)
    } catch (error) {
        console.error('Error fetching logs:', error)
        res.status(500).json({ error: 'Internal server error' })
    }
})

export default router
