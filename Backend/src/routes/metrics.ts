import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth'
import { cacheMiddleware, invalidateWorkspaceCache, CACHE_TTL } from '../middleware/cache'
import { subDays } from 'date-fns'
import { getTodayStr, getStartOfDay, getEndOfDay } from '../lib/dateUtils'

const router = Router()
const TIMEZONE = 'America/Santiago'

// 1. GET /api/metrics/summary?from=...&to=...
router.get('/summary', authenticate, cacheMiddleware(CACHE_TTL.MINUTE_5), async (req: AuthRequest, res) => {
    try {
        const workspaceId = req.user?.workspaceId
        if (!workspaceId) return res.status(400).json({ error: 'Workspace required' })

        const { from, to, excludeCampaigns } = req.query as { from?: string; to?: string; excludeCampaigns?: string }
        const excludedIds = excludeCampaigns ? excludeCampaigns.split(',') : []

        // Define date range
        let startZone: Date, endZone: Date
        if (from && to) {
            startZone = getStartOfDay(from)
            endZone = getEndOfDay(to)
        } else {
            const todayStr = getTodayStr()
            startZone = getStartOfDay(todayStr)
            endZone = getEndOfDay(todayStr)
        }

        const [metrics, fixedCosts, settings, orders, filteredMetaSpend, filteredGoogleSpend] = await Promise.all([
            prisma.dailyMetric.findMany({
                where: {
                    workspaceId,
                    date: { gte: startZone, lte: endZone }
                }
            }),
            prisma.fixedCost.findMany({
                where: { workspaceId, isActive: true }
            }),
            prisma.globalSetting.findUnique({
                where: { workspaceId }
            }),
            prisma.order.findMany({
                where: {
                    workspaceId,
                    financialStatus: { in: ['paid', 'partially_refunded', 'pending', 'authorized'] },
                    createdAt: { gte: startZone, lte: endZone }
                }
            }),
            // Filtered Meta AdSpend
            prisma.adSpend.groupBy({
                by: ['date'],
                _sum: { spend: true },
                where: {
                    workspaceId,
                    platform: 'META',
                    date: { gte: startZone, lte: endZone },
                    campaignId: excludedIds.length > 0 ? { notIn: excludedIds } : undefined
                }
            }),
            // Filtered Google AdSpend
            prisma.adSpend.groupBy({
                by: ['date'],
                _sum: { spend: true },
                where: {
                    workspaceId,
                    platform: 'GOOGLE',
                    date: { gte: startZone, lte: endZone },
                    campaignId: excludedIds.length > 0 ? { notIn: excludedIds } : undefined
                }
            })
        ])

        const totalFixedCosts = fixedCosts.reduce((sum, cost) => sum + Number(cost.amount), 0)
        const revenue = metrics.reduce((sum, m) => sum + Number(m.totalRevenue), 0)
        const orderCount = orders.length

        // Total spending from filtered queries
        const totalMetaSpend = filteredMetaSpend.reduce((sum, s) => sum + Number(s._sum.spend || 0), 0)
        const totalGoogleSpend = filteredGoogleSpend.reduce((sum, s) => sum + Number(s._sum.spend || 0), 0)

        let taxesAndFees = 0
        if (settings) {
            const taxAmount = revenue * (Number(settings.taxRate || 0) / 100)
            const gatewayPercentAmount = revenue * (Number(settings.gatewayPercent || 0) / 100)
            const gatewayFixedAmount = orderCount * Number(settings.gatewayFixed || 0)
            let customFeesAmount = 0
            const customFees = (settings.customFees as any[]) || []
            customFees.forEach(fee => {
                if (fee.type === 'percent') customFeesAmount += revenue * (Number(fee.amount || 0) / 100)
                else customFeesAmount += orderCount * Number(fee.amount || 0)
            })
            taxesAndFees = taxAmount + gatewayPercentAmount + gatewayFixedAmount + customFeesAmount
        }

        const summary = metrics.reduce((acc, m) => ({
            totalRevenue: acc.totalRevenue + Number(m.totalRevenue),
            totalShipping: acc.totalShipping + Number(m.totalShipping),
            totalCogs: acc.totalCogs + Number(m.totalCogs),
        }), {
            totalRevenue: 0,
            totalShipping: 0,
            totalCogs: 0,
        })

        // Recalculate netProfit with filteredMetaSpend & filteredGoogleSpend
        const netProfit = summary.totalRevenue - totalMetaSpend - totalGoogleSpend - summary.totalShipping - summary.totalCogs - totalFixedCosts - taxesAndFees

        const finalSummary = {
            ...summary,
            metaAdSpend: totalMetaSpend,
            googleAdSpend: totalGoogleSpend,
            netProfit: netProfit,
            totalFixedCosts,
            totalTaxAndFees: taxesAndFees
        }

        return res.status(200).json(finalSummary)
    } catch (error: any) {
        console.error('Metrics Summary error:', error)
        return res.status(500).json({ error: 'Internal server error', message: error.message })
    }
})

// Keep /daily for backwards compatibility if needed, but internally uses /summary logic
router.get('/daily', authenticate, cacheMiddleware(CACHE_TTL.MINUTE_5), async (req: AuthRequest, res) => {
    const workspaceId = req.user?.workspaceId
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' })
    const today = new Date().toISOString().split('T')[0]
    return res.redirect(`/api/metrics/summary?from=${today}&to=${today}`)
})

// 2. GET /api/metrics/range  (Chart data)
router.get('/range', authenticate, cacheMiddleware(CACHE_TTL.HOUR_1), async (req: AuthRequest, res) => {
    try {
        const workspaceId = req.user?.workspaceId
        if (!workspaceId) return res.status(400).json({ error: 'Workspace required' })

        const { from, to, days, excludeCampaigns } = req.query as { from?: string; to?: string; days?: string, excludeCampaigns?: string }
        const excludedIds = excludeCampaigns ? excludeCampaigns.split(',') : []

        let startDate: Date, endDate: Date
        if (from && to) {
            startDate = getStartOfDay(from)
            endDate = getEndOfDay(to)
        } else {
            const numDays = Number(days) || 7
            const todayStr = getTodayStr()
            startDate = subDays(getStartOfDay(todayStr), numDays)
            endDate = getEndOfDay(todayStr)
        }

        const [metrics, filteredMetaAdSpend, filteredGoogleAdSpend] = await Promise.all([
            prisma.dailyMetric.findMany({
                where: {
                    workspaceId,
                    date: { gte: startDate, lte: endDate }
                },
                orderBy: { date: 'asc' }
            }),
            prisma.adSpend.groupBy({
                by: ['date'],
                _sum: { spend: true },
                where: {
                    workspaceId,
                    platform: 'META',
                    date: { gte: startDate, lte: endDate },
                    campaignId: excludedIds.length > 0 ? { notIn: excludedIds } : undefined
                }
            }),
            prisma.adSpend.groupBy({
                by: ['date'],
                _sum: { spend: true },
                where: {
                    workspaceId,
                    platform: 'GOOGLE',
                    date: { gte: startDate, lte: endDate },
                    campaignId: excludedIds.length > 0 ? { notIn: excludedIds } : undefined
                }
            })
        ])

        const metaSpendMap = filteredMetaAdSpend.reduce((acc, s) => {
            const dateStr = s.date.toISOString().split('T')[0]
            acc[dateStr] = Number(s._sum.spend || 0)
            return acc
        }, {} as Record<string, number>)

        const googleSpendMap = filteredGoogleAdSpend.reduce((acc, s) => {
            const dateStr = s.date.toISOString().split('T')[0]
            acc[dateStr] = Number(s._sum.spend || 0)
            return acc
        }, {} as Record<string, number>)

        const metricsMap = metrics.reduce((acc, m) => {
            const dateStr = m.date.toISOString().split('T')[0]
            acc[dateStr] = m
            return acc
        }, {} as Record<string, any>)

        // Fill missing days with zeroed-metrics
        const mappedMetrics = []
        let currentDate = new Date(startDate)

        while (currentDate <= endDate) {
            const dateStr = currentDate.toISOString().split('T')[0]
            const m = metricsMap[dateStr]
            const metaSpend = metaSpendMap[dateStr] || 0
            const googleSpend = googleSpendMap[dateStr] || 0

            if (m) {
                const profit = Number(m.totalRevenue) - metaSpend - googleSpend - Number(m.totalShipping) - Number(m.totalCogs)
                mappedMetrics.push({
                    ...m,
                    totalRevenue: Number(m.totalRevenue),
                    metaAdSpend: metaSpend,
                    googleAdSpend: googleSpend,
                    totalShipping: Number(m.totalShipping),
                    totalCogs: Number(m.totalCogs),
                    netProfit: profit,
                })
            } else {
                mappedMetrics.push({
                    id: `fake-${dateStr}`,
                    workspaceId,
                    date: currentDate.toISOString(),
                    totalRevenue: 0,
                    metaAdSpend: metaSpend,
                    googleAdSpend: googleSpend,
                    totalShipping: 0,
                    totalCogs: 0,
                    netProfit: -(metaSpend + googleSpend),
                })
            }

            // increment 1 day
            currentDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000)
        }

        return res.status(200).json(mappedMetrics)
    } catch (error: any) {
        console.error('Metrics Range error:', error)
        return res.status(500).json({ error: 'Internal server error', message: error.message })
    }
})

// 3. GET /api/metrics/finances
router.get('/finances', authenticate, async (req: AuthRequest, res) => {
    try {
        const workspaceId = req.user?.workspaceId
        if (!workspaceId) return res.status(400).json({ error: 'Workspace required' })

        const costs = await prisma.fixedCost.findMany({
            where: { workspaceId, isActive: true }
        })
        const settings = await prisma.globalSetting.findUnique({
            where: { workspaceId }
        })

        return res.status(200).json({
            fixedCosts: costs,
            settings: settings || { taxRate: 0, gatewayPercent: 0, gatewayFixed: 0, currency: 'usd', timezone: 'santiago' },
            summary: {
                totalFixedCosts: costs.reduce((sum, cost) => sum + Number(cost.amount), 0)
            }
        })
    } catch (error: any) {
        console.error('Metrics Finances error:', error)
        return res.status(500).json({ error: 'Internal server error', message: error.message })
    }
})

// 3.1 POST /api/metrics/finances/fixed-costs
router.post('/finances/fixed-costs', authenticate, async (req: AuthRequest, res) => {
    try {
        const workspaceId = req.user?.workspaceId
        if (!workspaceId) return res.status(400).json({ error: 'Workspace required' })

        const { id, name, category, amount } = req.body
        if (!name || isNaN(Number(amount))) return res.status(400).json({ error: 'Invalid config' })

        const cost = id
            ? await prisma.fixedCost.update({
                where: { id },
                data: { name, category, amount: Number(amount) }
            })
            : await prisma.fixedCost.create({
                data: { workspaceId, name, category, amount: Number(amount) }
            })

        await invalidateWorkspaceCache(workspaceId)
        return res.status(200).json(cost)
    } catch (error: any) {
        return res.status(500).json({ error: 'Failed to save fixed cost', message: error.message })
    }
})

// 3.2 DELETE /api/metrics/finances/fixed-costs/:id
router.delete('/finances/fixed-costs/:id', authenticate, async (req: AuthRequest, res) => {
    try {
        const workspaceId = req.user?.workspaceId
        if (!workspaceId) return res.status(400).json({ error: 'Workspace required' })

        const id = req.params.id
        await prisma.fixedCost.delete({ where: { id } })
        await invalidateWorkspaceCache(workspaceId)
        return res.status(200).json({ success: true })
    } catch (error: any) {
        return res.status(500).json({ error: 'Failed to delete fixed cost', message: error.message })
    }
})

// 4. GET /api/metrics/sku-performance?from=...&to=...
router.get('/sku-performance', authenticate, cacheMiddleware(CACHE_TTL.HOUR_1), async (req: AuthRequest, res) => {
    try {
        const workspaceId = req.user?.workspaceId
        if (!workspaceId) return res.status(400).json({ error: 'Workspace required' })

        const { from, to, excludeCampaigns } = req.query as { from?: string; to?: string; excludeCampaigns?: string }
        const excludedIds = excludeCampaigns ? excludeCampaigns.split(',') : []

        let start: Date, end: Date
        if (from && to) {
            start = getStartOfDay(from)
            end = getEndOfDay(to)
        } else {
            // Default to last 7 days for performance if no range provided
            const todayStr = getTodayStr()
            end = getEndOfDay(todayStr)
            start = subDays(getStartOfDay(todayStr), 7)
        }

        // Get paid orders and adSpend in range
        // Get paid orders
        const orders = await prisma.order.findMany({
            where: {
                workspaceId,
                financialStatus: { in: ['paid', 'partially_refunded'] },
                createdAt: { gte: start, lte: end }
            }
        })
        
        // 1. Fetch AdSpend data grouped by campaign to perform smart attribution
        const campaignSpend = await prisma.adSpend.groupBy({
            by: ['campaignName', 'campaignId'],
            where: {
                workspaceId,
                date: { gte: start, lte: end },
                campaignId: excludedIds.length > 0 ? { notIn: excludedIds } : undefined
            },
            _sum: { spend: true }
        })

        const totalFilteredAdSpend = campaignSpend.reduce((sum, c) => sum + Number(c._sum.spend || 0), 0)

        // Aggregate order data by SKU
        const skuMap: Record<string, { name: string, sales: number, revenue: number, orderFallbacks: number }> = {}

        orders.forEach(order => {
            const items = order.lineItems as any[]
            if (Array.isArray(items)) {
                let hasRealPrices = false;
                let totalItemsQty = 0;
                items.forEach(item => {
                    if (Number(item.price) > 0) hasRealPrices = true;
                    totalItemsQty += (item.quantity || 1);
                });

                const needsOrderFallback = (!hasRealPrices && totalItemsQty > 0 && Number(order.totalPrice) > 0);
                const proratedPrice = needsOrderFallback ? (Number(order.totalPrice) / totalItemsQty) : 0;

                items.forEach(item => {
                    const sku = item.sku && item.sku !== "" ? item.sku : (item.title || 'Unknown')
                    if (!skuMap[sku]) {
                        skuMap[sku] = { name: item.title || sku, sales: 0, revenue: 0, orderFallbacks: 0 }
                    }
                    const qty = item.quantity || 1
                    skuMap[sku].sales += qty

                    const itemPrice = Number(item.price) || 0
                    if (itemPrice > 0) {
                        skuMap[sku].revenue += itemPrice * qty
                    } else if (needsOrderFallback) {
                        skuMap[sku].revenue += proratedPrice * qty
                        skuMap[sku].orderFallbacks += qty
                    }
                })
            }
        })

        // Get Products for real COGS
        const products = await prisma.product.findMany({
            where: { workspaceId }
        })
        const productMap = products.reduce((acc, p) => ({ ...acc, [p.sku]: p }), {} as Record<string, any>)

        let totalSalesRevenue = 0
        Object.values(skuMap).forEach(s => totalSalesRevenue += s.revenue)

        // --- SMART ADSPEND ATTRIBUTION ---
        const attributedSpendMap: Record<string, number> = {}
        let unattributedSpend = 0

        // Initialize attribution maps
        Object.keys(skuMap).forEach(sku => { attributedSpendMap[sku] = 0 })

        campaignSpend.forEach(camp => {
            const spendValue = Number(camp._sum.spend || 0)
            const campName = camp.campaignName.toLowerCase()
            let matched = false

            // Try to find a matching SKU/Product Name in this campaign name
            for (const sku in skuMap) {
                const productName = skuMap[sku].name.toLowerCase()
                const skuUpper = sku.toLowerCase()
                
                // Match criteria: Campaign name contains SKU code OR contains 70% of product name words
                // (Very basic NLP: simple .includes works for most cases)
                if (campName.includes(skuUpper) || (productName.length > 3 && campName.includes(productName))) {
                    attributedSpendMap[sku] += spendValue
                    matched = true
                    break; // Assign to the first matching product found
                }
            }

            if (!matched) {
                unattributedSpend += spendValue
            }
        })

        // Final Performance Calculation
        const performance = Object.entries(skuMap).map(([sku, data]) => {
            const product = productMap[sku]

            // Fallback for missing/NaN revenue
            if (data.revenue === 0 && data.sales > 0 && product && Number(product.price) > 0) {
                data.revenue = Number(product.price) * data.sales;
            }

            let cogs = product ? (Number(product.cogs) * data.sales) : 0

            // Calculation: Direct Attributed Spend + Proportional share of Unattributed Spend (General/Brand/Home)
            const shareOfUnattributed = totalSalesRevenue > 0 ? (data.revenue / totalSalesRevenue) * unattributedSpend : 0
            const adspend = attributedSpendMap[sku] + shareOfUnattributed
            
            const profit = data.revenue - cogs - adspend
            const margin = data.revenue > 0 ? (profit / data.revenue) * 100 : (data.sales > 0 ? -100 : 0)

            return {
                sku,
                name: data.name,
                sales: data.sales,
                revenue: data.revenue,
                cogs: cogs,
                adspend: adspend,
                profit: profit,
                margin: `${margin.toFixed(1)}%`,
                marginRaw: margin,
                price: product ? Number(product.price) : (data.sales > 0 ? (data.revenue / data.sales) : 0),
                cost: (product ? Number(product.cogs) : 0)
            }
        }).sort((a, b) => b.profit - a.profit)

        return res.status(200).json(performance)
    } catch (error: any) {
        console.error('Metrics SKU Performance error:', error)
        return res.status(500).json({ error: 'Internal server error', message: error.message })
    }
})

// 5. GET /api/metrics/customers-ltv
router.get('/customers-ltv', authenticate, cacheMiddleware(CACHE_TTL.HOUR_1), async (req: AuthRequest, res) => {
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

        const orders = await prisma.order.findMany({
            where: {
                workspaceId,
                financialStatus: { in: ['paid', 'partially_refunded'] },
                ...dateFilter
            }
        })

        if (orders.length === 0) {
            return res.status(200).json({ ltv: 0, repurchaseRate: 0, totalCustomers: 0 })
        }

        const customerMap: Record<string, { totalSpent: number, orderCount: number }> = {}
        let totalRevenue = 0

        orders.forEach(order => {
            const email = order.customerEmail || `guest-${order.shopifyId || order.id}`
            if (!customerMap[email]) {
                customerMap[email] = { totalSpent: 0, orderCount: 0 }
            }
            customerMap[email].orderCount += 1
            const price = Number(order.totalPrice)
            customerMap[email].totalSpent += price
            totalRevenue += price
        })

        const totalCustomers = Object.keys(customerMap).length
        const returningCustomers = Object.values(customerMap).filter(c => c.orderCount > 1).length

        const ltv = totalCustomers > 0 ? totalRevenue / totalCustomers : 0
        const repurchaseRate = totalCustomers > 0 ? (returningCustomers / totalCustomers) * 100 : 0

        return res.status(200).json({
            ltv: ltv.toFixed(2),
            repurchaseRate: repurchaseRate.toFixed(1),
            totalCustomers
        })

    } catch (error: any) {
        console.error('Metrics LTV error:', error)
        return res.status(500).json({ error: 'Internal server error', message: error.message })
    }
})

// 6. GET /api/metrics/returns
router.get('/returns', authenticate, cacheMiddleware(CACHE_TTL.HOUR_1), async (req: AuthRequest, res) => {
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

        const refundedOrders = await prisma.order.findMany({
            where: {
                workspaceId,
                financialStatus: { in: ['refunded', 'partially_refunded'] },
                ...dateFilter
            }
        })

        const totalRefunded = refundedOrders.reduce((sum, order) => sum + Number(order.totalPrice), 0)

        return res.status(200).json({
            count: refundedOrders.length,
            totalValue: totalRefunded.toFixed(2),
            orders: refundedOrders.map(o => ({
                id: o.orderId,
                date: o.createdAt,
                customer: o.customerName,
                status: o.financialStatus,
                value: Number(o.totalPrice).toFixed(2)
            }))
        })

    } catch (error: any) {
        console.error('Metrics Returns error:', error)
        return res.status(500).json({ error: 'Internal server error', message: error.message })
    }
})

export default router
