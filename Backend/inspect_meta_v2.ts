
import { PrismaClient } from '@prisma/client'
import fs from 'fs'
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
        take: 3,
        orderBy: { date: 'desc' }
    });

    const report = {
        total_registros: counts._count._all,
        desde: counts._min.date,
        hasta: counts._max.date,
        gasto_total: counts._sum.spend,
        campanas_activas: campaigns.length,
        uiltimos_registros: samples
    };

    fs.writeFileSync('db_meta_report_utf8.json', JSON.stringify(report, null, 2), 'utf8');
    console.log("REPORTE GENERADO EN db_meta_report_utf8.json");
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
