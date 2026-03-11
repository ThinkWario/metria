import { Router } from 'express'
import crypto from 'crypto'
import { prisma } from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth'
import { invalidateWorkspaceCache } from '../middleware/cache'
import { createAuditLog } from '../lib/logger'
import { getStartOfDay, getEndOfDay } from '../lib/dateUtils'
import 'dotenv/config'

const TIMEZONE = 'America/Santiago'

const router = Router()
const SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET || ''

// Middleware to verify Shopify HMAC
const verifyShopifyWebhook = (req: any, res: any, next: any) => {
    const hmacHeader = req.get('X-Shopify-Hmac-Sha256')
    if (!hmacHeader) return res.status(401).send('No HMAC header')

    const data = req.body // Raw body required here
    const hash = crypto
        .createHmac('sha256', SHOPIFY_WEBHOOK_SECRET)
        .update(data, 'utf8')
        .digest('base64')

    if (hash !== hmacHeader) {
        return res.status(401).send('Invalid HMAC')
    }

    // Convert raw body to JSON for next handlers
    try {
        req.body = JSON.parse(data.toString())
        next()
    } catch (e) {
        return res.status(400).send('Invalid JSON')
    }
}

// 1. Webhook: Order Created
router.post('/webhooks/orders/create', verifyShopifyWebhook, async (req, res) => {
    try {
        const order = req.body
        const workspaceId = req.query.workspaceId as string
        if (!workspaceId) return res.status(400).send('Missing workspaceId query param')

        const newOrder = await prisma.order.upsert({
            where: { workspaceId_shopifyId: { workspaceId, shopifyId: order.id.toString() } },
            update: {
                totalPrice: parseFloat(order.total_price),
                financialStatus: order.financial_status,
                fulfillmentStatus: order.fulfillment_status,
                updatedAt: new Date(order.updated_at),
                lineItems: order.line_items.map((item: any) => {
                    const price = parseFloat(item.price || 0);
                    const qty = item.quantity || 1;
                    const discount = parseFloat(item.total_discount || 0);
                    const effPrice = qty > 0 ? (price * qty - discount) / qty : price;
                    return { title: item.title, sku: item.sku, quantity: qty, price: effPrice };
                })
            },
            create: {
                workspaceId,
                orderId: order.name,
                shopifyId: order.id.toString(),
                customerName: order.customer ? `${order.customer.first_name} ${order.customer.last_name}` : 'Unknown',
                customerEmail: order.email,
                totalPrice: parseFloat(order.total_price),
                currency: order.currency,
                financialStatus: order.financial_status,
                fulfillmentStatus: order.fulfillment_status,
                lineItems: order.line_items.map((item: any) => {
                    const price = parseFloat(item.price || 0);
                    const qty = item.quantity || 1;
                    const discount = parseFloat(item.total_discount || 0);
                    const effPrice = qty > 0 ? (price * qty - discount) / qty : price;
                    return { title: item.title, sku: item.sku, quantity: qty, price: effPrice };
                }),
                createdAt: new Date(order.created_at)
            }
        })
        return res.status(200).send('Webhook processed')
    } catch (error) {
        console.error('Shopify Create Order Error:', error)
        return res.status(500).send('Error processing webhook')
    }
})

// 2. Webhook: Order Updated
router.post('/webhooks/orders/updated', verifyShopifyWebhook, async (req, res) => {
    try {
        const order = req.body
        const workspaceId = req.query.workspaceId as string
        if (!workspaceId) return res.status(400).send('Missing workspaceId query param')

        await prisma.order.updateMany({
            where: { workspaceId, shopifyId: order.id.toString() },
            data: {
                financialStatus: order.financial_status,
                fulfillmentStatus: order.fulfillment_status,
                updatedAt: new Date(order.updated_at)
            }
        })
        return res.status(200).send('Webhook processed')
    } catch (error) {
        console.error('Shopify Update Order Error:', error)
        return res.status(500).send('Error processing webhook')
    }
})

// 3. GET /api/shopify/orders
router.get('/orders', authenticate, async (req: AuthRequest, res) => {
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
                    gte: getStartOfDay(from as string),
                    lte: getEndOfDay(to as string)
                }
            }
        }

        const orders = await prisma.order.findMany({
            where: { workspaceId, ...dateFilter },
            take: limit,
            skip: (page - 1) * limit,
            orderBy: { createdAt: 'desc' }
        })

        const total = await prisma.order.count({ where: { workspaceId, ...dateFilter } })

        return res.status(200).json({
            data: orders,
            meta: { total, page, limit }
        })
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' })
    }
})

// 4. POST /api/shopify/sync
router.post('/sync', authenticate, async (req: AuthRequest, res) => {
    try {
        const workspaceId = req.user?.workspaceId
        if (!workspaceId) return res.status(400).json({ error: 'Workspace required' })

        // Get Shopify integration config
        const integration = await prisma.integration.findUnique({
            where: { workspaceId_platform: { workspaceId, platform: 'shopify' } }
        })

        if (!integration || !integration.config) {
            return res.status(400).json({ error: 'Shopify integration not configured' })
        }

        const config = integration.config as Record<string, string>
        const domain = config.domain?.replace(/^https?:\/\//, '').replace(/\/$/, '')
        const accessToken = config.accessToken

        if (!domain || !accessToken) {
            return res.status(400).json({ error: 'Missing domain or accessToken in Shopify config' })
        }

        // Fetch orders from Shopify REST API (last 60 days, up to 250 orders)
        // using 2024-01 version. status=any brings all paid, pending, refunded.
        const response = await fetch(`https://${domain}/admin/api/2024-01/orders.json?status=any&limit=250`, {
            headers: {
                'X-Shopify-Access-Token': accessToken,
                'Content-Type': 'application/json'
            }
        })

        if (!response.ok) {
            const errText = await response.text()
            console.error('Shopify Sync API Error:', response.status, errText)
            return res.status(response.status).json({ error: 'Failed to fetch from Shopify API', details: errText })
        }

        const data = await response.json()
        const orders = data.orders || []

        // Upsert all orders and aggregate daily revenue
        let processed = 0
        const dailyRevenues: Record<string, number> = {}

        for (const order of orders) {
            // Count paid, pending, authorized or partially_refunded as potential revenue
            const validStatuses = ['paid', 'partially_refunded', 'pending', 'authorized']
            if (validStatuses.includes(order.financial_status)) {
                const dateStr = new Date(order.created_at).toISOString().split('T')[0]
                dailyRevenues[dateStr] = (dailyRevenues[dateStr] || 0) + parseFloat(order.total_price)
            }

            await prisma.order.upsert({
                where: { workspaceId_shopifyId: { workspaceId, shopifyId: order.id.toString() } },
                update: {
                    totalPrice: parseFloat(order.total_price),
                    financialStatus: order.financial_status,
                    fulfillmentStatus: order.fulfillment_status,
                    updatedAt: new Date(order.updated_at),
                    lineItems: order.line_items.map((item: any) => {
                        const price = parseFloat(item.price || 0);
                        const qty = item.quantity || 1;
                        const discount = parseFloat(item.total_discount || 0);
                        const effPrice = qty > 0 ? (price * qty - discount) / qty : price;
                        return { title: item.title, sku: item.sku, quantity: qty, price: effPrice };
                    })
                },
                create: {
                    workspaceId,
                    orderId: order.name,
                    shopifyId: order.id.toString(),
                    customerName: order.customer ? `${order.customer.first_name} ${order.customer.last_name}` : 'Unknown',
                    customerEmail: order.email,
                    totalPrice: parseFloat(order.total_price),
                    currency: order.currency,
                    financialStatus: order.financial_status,
                    fulfillmentStatus: order.fulfillment_status,
                    lineItems: order.line_items.map((item: any) => {
                        const price = parseFloat(item.price || 0);
                        const qty = item.quantity || 1;
                        const discount = parseFloat(item.total_discount || 0);
                        const effPrice = qty > 0 ? (price * qty - discount) / qty : price;
                        return { title: item.title, sku: item.sku, quantity: qty, price: effPrice };
                    }),
                    createdAt: new Date(order.created_at)
                }
            })
            processed++
        }

        // Upsert DailyMetrics with the aggregated revenues
        for (const [dateStr, revenue] of Object.entries(dailyRevenues)) {
            const dateObj = new Date(dateStr)

            // Fast upsert without overriding other fields entirely if it exists
            const existing = await prisma.dailyMetric.findUnique({
                where: { workspaceId_date: { workspaceId, date: dateObj } }
            })

            if (existing) {
                await prisma.dailyMetric.update({
                    where: { id: existing.id },
                    data: {
                        totalRevenue: revenue,
                        netProfit: Number(revenue) - Number(existing.metaAdSpend) - Number(existing.googleAdSpend) - Number(existing.totalShipping) - Number(existing.totalCogs)
                    }
                })
            } else {
                await prisma.dailyMetric.create({
                    data: {
                        workspaceId,
                        date: dateObj,
                        totalRevenue: revenue,
                        metaAdSpend: 0,
                        googleAdSpend: 0,
                        totalShipping: 0,
                        totalCogs: 0,
                        netProfit: revenue,
                    }
                })
            }
        }

        // Update lastSync
        await prisma.integration.update({
            where: { id: integration.id },
            data: { lastSync: new Date(), status: 'Connected' }
        })

        await invalidateWorkspaceCache(workspaceId)

        await createAuditLog({
            workspaceId,
            source: 'Shopify',
            event: 'Sync',
            status: '200 OK',
            message: `Sincronizadas ${processed} órdenes con éxito.`
        })

        return res.status(200).json({ success: true, count: processed })
    } catch (error) {
        console.error('Shopify Sync Error:', error)
        return res.status(500).json({ error: 'Internal server error while syncing Shopify' })
    }
})

export default router
