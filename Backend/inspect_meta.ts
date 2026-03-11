
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    console.log("--- ANALIZANDO DATOS DE META ADS EN DB ---");

    const counts = await prisma.adSpend.aggregate({
        where: { platform: 'META' },
        _count: { _all: true },
        _min: { date: true },
        _max: { date: true },
        _sum: { spend: true }
    });

    const campaigns = await prisma.adSpend.groupBy({
        by: ['campaignName', 'campaignId'],
        where: { platform: 'META' },
        _count: { _all: true },
        _sum: { spend: true }
    });

    const samples = await prisma.adSpend.findMany({
        where: { platform: 'META' },
        take: 5,
        orderBy: { date: 'desc' }
    });

    console.log(JSON.stringify({
        total_registros: counts._count._all,
        desde: counts._min.date,
        hasta: counts._max.date,
        gasto_total: counts._sum.spend,
        campañas_activas: campaigns.length,
        uiltimos_registros: samples
    }, null, 2));
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
