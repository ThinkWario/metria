import { prisma } from './prisma'

export type MetricField =
    | 'metaAdSpend'
    | 'googleAdSpend'
    | 'tiktokAdSpend'
    | 'totalRevenue'
    | 'totalShipping'
    | 'totalCogs'

/**
 * Upserts a DailyMetric record for the given workspace and date,
 * updating a single field and recalculating netProfit.
 *
 * @param operation 'set' replaces the field value (default); 'increment' adds to it (used by Dropi shipping fees)
 */
export async function upsertDailyMetric(
    workspaceId: string,
    date: Date,
    field: MetricField,
    value: number,
    operation: 'set' | 'increment' = 'set'
): Promise<void> {
    const existing = await prisma.dailyMetric.findUnique({
        where: { workspaceId_date: { workspaceId, date } }
    })

    if (existing) {
        const current = {
            metaAdSpend: Number(existing.metaAdSpend),
            googleAdSpend: Number(existing.googleAdSpend),
            tiktokAdSpend: Number(existing.tiktokAdSpend || 0),
            totalRevenue: Number(existing.totalRevenue),
            totalShipping: Number(existing.totalShipping),
            totalCogs: Number(existing.totalCogs),
        }

        const updated = { ...current }
        updated[field] = operation === 'increment' ? current[field] + value : value

        const netProfit =
            updated.totalRevenue
            - updated.metaAdSpend
            - updated.googleAdSpend
            - updated.tiktokAdSpend
            - updated.totalShipping
            - updated.totalCogs

        await prisma.dailyMetric.update({
            where: { id: existing.id },
            data: { [field]: updated[field], netProfit }
        })
    } else {
        const defaults = {
            metaAdSpend: 0,
            googleAdSpend: 0,
            tiktokAdSpend: 0,
            totalRevenue: 0,
            totalShipping: 0,
            totalCogs: 0,
        }
        defaults[field] = value

        const netProfit =
            defaults.totalRevenue
            - defaults.metaAdSpend
            - defaults.googleAdSpend
            - defaults.tiktokAdSpend
            - defaults.totalShipping
            - defaults.totalCogs

        await prisma.dailyMetric.create({
            data: { workspaceId, date, ...defaults, netProfit }
        })
    }
}
