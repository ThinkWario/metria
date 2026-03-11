import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { startOfDay, endOfDay } from 'date-fns'

const router = Router()

// Internal API key for n8n AI Agent calls
const INTERNAL_AI_KEY = process.env.INTERNAL_AI_KEY || 'valentina-secret-key-123'

const aiAuth = (req: any, res: any, next: any) => {
    const key = req.headers['x-api-key']
    if (key !== INTERNAL_AI_KEY) {
        return res.status(401).json({ error: 'Unauthorized AI Agent' })
    }
    next()
}

router.get('/valentina-context', aiAuth, async (req, res) => {
    try {
        const workspaceId = req.query.workspaceId as string
        if (!workspaceId) return res.status(400).json({ error: 'Workspace required' })

        const today = new Date()
        const start = startOfDay(today)
        const end = endOfDay(today)

        // Read specific order if provided
        const orderId = req.query.orderId as string
        if (orderId) {
            const order = await prisma.order.findUnique({
                where: { workspaceId_orderId: { workspaceId, orderId } },
                include: { shipments: true }
            })
            if (!order) return res.status(404).json({ error: 'Order not found' })
            return res.status(200).json(order)
        }

        // Return daily summary for general AI questions
        const metric = await prisma.dailyMetric.findFirst({
            where: { workspaceId, date: { gte: start, lte: end } }
        })

        const latestOrders = await prisma.order.findMany({
            where: { workspaceId },
            take: 5,
            orderBy: { createdAt: 'desc' },
            select: { orderId: true, customerName: true, totalPrice: true, financialStatus: true }
        })

        return res.status(200).json({
            serverTime: new Date().toISOString(),
            dailyMetrics: metric || null,
            latestOrders
        })
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' })
    }
})

export default router
