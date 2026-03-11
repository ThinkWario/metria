import { prisma } from '../lib/prisma';

async function checkDB() {
    console.log('--- DATABASE STATUS REPORT ---');
    
    const counts = await Promise.all([
        prisma.workspace.count(),
        prisma.user.count(),
        prisma.order.count(),
        prisma.dailyMetric.count(),
        prisma.adSpend.count(),
        prisma.product.count(),
        prisma.fixedCost.count(),
        prisma.integration.count()
    ]);

    console.log(`Workspaces: ${counts[0]}`);
    console.log(`Users: ${counts[1]}`);
    console.log(`Orders: ${counts[2]}`);
    console.log(`DailyMetrics: ${counts[3]}`);
    console.log(`AdSpend Records: ${counts[4]}`);
    console.log(`Products (SKUs): ${counts[5]}`);
    console.log(`Fixed Costs: ${counts[6]}`);
    console.log(`Integrations: ${counts[7]}`);

    if (counts[2] > 0) {
        const lastOrders = await prisma.order.findMany({
            take: 5,
            orderBy: { createdAt: 'desc' },
            select: { orderId: true, customerName: true, totalPrice: true, createdAt: true }
        });
        console.log('\n--- Recent Orders (Top 5) ---');
        lastOrders.forEach(o => {
            console.log(`[${o.createdAt.toISOString().split('T')[0]}] ${o.orderId} - ${o.customerName}: $${o.totalPrice}`);
        });
    }

    if (counts[4] > 0) {
        const platformSpend = await prisma.adSpend.groupBy({
            by: ['platform'],
            _sum: { spend: true }
        });
        console.log('\n--- Total Spend by Platform ---');
        platformSpend.forEach(p => {
            console.log(`${p.platform}: $${Number(p._sum.spend).toFixed(2)}`);
        });
    }

    await prisma.$disconnect();
}

checkDB();
