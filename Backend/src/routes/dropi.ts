import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth'
import { invalidateWorkspaceCache } from '../middleware/cache'
import { createAuditLog } from '../lib/logger'
import { getStartOfDay, getEndOfDay } from '../lib/dateUtils'
import { upsertDailyMetric } from '../lib/metrics'

const router = Router()

const verifyDropiWebhook = (req: any, res: any, next: any) => {
    const token = req.headers['x-dropi-token']
    if (!token || token !== process.env.DROPI_WEBHOOK_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' })
    }
    next()
}

// Webhook is public (no 'authenticate' middleware), token-based security
router.post('/webhooks/status', async (req, res) => {
    try {
        const token = req.headers['x-dropi-token']
        const workspaceId = req.query.workspaceId as string || req.body.workspaceId

        if (!workspaceId) {
            return res.status(400).json({ error: 'Missing workspaceId' })
        }

        // Robust isolation: Fetch integration config for this workspace
        const integration = await prisma.integration.findFirst({
            where: { workspaceId, platform: 'Dropi' }
        })

        const config = (integration?.config as any) || {}
        const secret = config.webhookSecret || process.env.DROPI_WEBHOOK_SECRET

        if (!token || token !== secret) {
            return res.status(401).json({ error: 'Unauthorized: Invalid token' })
        }

        const { guideId, orderId, clientName, city, status, collectedValue, shippingFee } = req.body

        if (!guideId) {
            return res.status(400).json({ error: 'Missing guideId' })
        }

        await prisma.shipment.upsert({
            where: { workspaceId_guideId: { workspaceId, guideId } },
            update: {
                status,
                collectedValue: collectedValue ? parseFloat(collectedValue) : null,
                shippingFee: shippingFee ? parseFloat(shippingFee) : null,
            },
            create: {
                workspaceId,
                guideId,
                orderId: orderId || null,
                clientName: clientName || 'Unknown',
                city: city || 'Unknown',
                status,
                collectedValue: collectedValue ? parseFloat(collectedValue) : null,
                shippingFee: shippingFee ? parseFloat(shippingFee) : null,
            }
        })

        if (shippingFee) {
            const today = new Date(new Date().toISOString().split('T')[0])
            await upsertDailyMetric(workspaceId, today, 'totalShipping', parseFloat(shippingFee), 'increment')
        }

        await invalidateWorkspaceCache(workspaceId)

        await createAuditLog({
            workspaceId,
            source: 'Dropi',
            event: 'Status Webhook',
            status: '200 OK',
            message: `Pedido #${orderId || 'Desconocido'} actualizado a: ${status}`
        })

        return res.status(200).json({ message: 'Webhook processed successfully' })
    } catch (error) {
        console.error('Dropi Webhook Error:', error)
        return res.status(500).json({ error: 'Internal server error' })
    }
})

// 2. GET /api/dropi/shipments
router.get('/shipments', authenticate, async (req: AuthRequest, res) => {
    try {
        const workspaceId = req.user?.workspaceId
        if (!workspaceId) return res.status(400).json({ error: 'Workspace required' })

        const limit = Number(req.query.limit) || 50
        const page = Number(req.query.page) || 1
        const { from, to } = req.query as { from?: string; to?: string }

        let dateFilter = {}
        if (from && to) {
            dateFilter = {
                createdAt: {
                    gte: getStartOfDay(from),
                    lte: getEndOfDay(to)
                }
            }
        }

        const shipments = await prisma.shipment.findMany({
            where: { workspaceId, ...dateFilter },
            take: limit,
            skip: (page - 1) * limit,
            orderBy: { createdAt: 'desc' }
        })

        const total = await prisma.shipment.count({ where: { workspaceId, ...dateFilter } })

        return res.status(200).json({
            data: shipments,
            meta: { total, page, limit }
        })
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' })
    }
})

// 3. GET /api/dropi/summary
router.get('/summary', authenticate, async (req: AuthRequest, res) => {
    try {
        const workspaceId = req.user?.workspaceId
        if (!workspaceId) return res.status(400).json({ error: 'Workspace required' })

        const { from, to } = req.query as { from?: string; to?: string }
        let dateFilter = {}
        if (from && to) {
            dateFilter = {
                createdAt: {
                    gte: getStartOfDay(from),
                    lte: getEndOfDay(to)
                }
            }
        }

        const totalShipments = await prisma.shipment.count({ where: { workspaceId, ...dateFilter } })
        const delivered = await prisma.shipment.count({ where: { workspaceId, status: 'Entregado', ...dateFilter } })
        const returned = await prisma.shipment.count({ where: { workspaceId, status: 'Devuelto', ...dateFilter } })
        const inTransit = await prisma.shipment.count({ where: { workspaceId, status: 'En Tránsito', ...dateFilter } })
        const pending = await prisma.shipment.count({ where: { workspaceId, status: 'Pendiente', ...dateFilter } })

        const collectedSumResult = await prisma.shipment.aggregate({
            _sum: { collectedValue: true },
            where: { workspaceId, status: 'Entregado', ...dateFilter }
        })

        return res.status(200).json({
            deliveryRate: totalShipments > 0 ? (delivered / totalShipments) * 100 : 0,
            returnRate: totalShipments > 0 ? (returned / totalShipments) * 100 : 0,
            activeGuides: inTransit + pending,
            totalCollected: collectedSumResult._sum.collectedValue || 0,
            breakdown: {
                delivered,
                inTransit,
                returned,
                pending
            }
        })
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' })
    }
})

export default router
