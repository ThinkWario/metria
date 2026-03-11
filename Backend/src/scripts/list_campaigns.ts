import { prisma } from '../lib/prisma';
import fs from 'fs';

async function listCampaigns() {
    const campaigns = await prisma.adSpend.groupBy({
        by: ['campaignId', 'campaignName'],
        _sum: { spend: true }
    });

    let output = `Found ${campaigns.length} unique campaigns.\n\n`;
    campaigns.forEach(c => {
        output += `ID: ${c.campaignId} | Name: ${c.campaignName} | Spend: $${Number(c._sum.spend).toFixed(2)}\n`;
    });

    fs.writeFileSync('campaign_list_output.txt', output);
    console.log('Results written to campaign_list_output.txt');
    await prisma.$disconnect();
}

listCampaigns();
