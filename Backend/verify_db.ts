import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log("Fetching all META AdSpends...");
    const spends = await prisma.adSpend.findMany({
        where: { platform: 'META' }
    });
    console.log(`Found ${spends.length} records.`);
    console.dir(spends, { depth: null });

    console.log("\nTesting GET campaigns query:");
    const campaigns = await prisma.adSpend.groupBy({
        by: ['campaignId', 'campaignName'],
        where: { platform: 'META' },
        _sum: {
            spend: true,
            impressions: true,
            clicks: true,
            conversions: true,
            conversionValue: true
        }
    });
    console.dir(campaigns, { depth: null });
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
