import { PrismaClient } from '@prisma/client';
import { invalidateWorkspaceCache } from './src/middleware/cache';

const prisma = new PrismaClient();

async function main() {
  const orders = await prisma.order.findMany({ where: { workspaceId: 'workspace-default' } });
  
  for (const o of orders) {
    const items = o.lineItems as any[];
    if (items && Array.isArray(items)) {
      const newItems = items.map(i => {
        if (i.price && i.price > 0) return i; // Already has price
        
        let newPrice = 0;
        if (i.sku === 'DEA0078') newPrice = 2032;
        else if (i.sku === '74830159810174') newPrice = 4500;
        else if (i.sku === 'ALI0415') newPrice = 35000;
        else if (i.sku === 'ALI0416') newPrice = 35000;
        else if (i.sku === 'ART0041') newPrice = 12500;
        else newPrice = Math.floor(Number(o.totalPrice) / (i.quantity || 1));
        
        return {
          ...i,
          price: newPrice
        };
      });
      await prisma.order.update({ where: { id: o.id }, data: { lineItems: newItems } });
    }
  }

  // Then clear cache
  await invalidateWorkspaceCache('workspace-default');
  console.log('Fixed workspace-default orders and cleared cache!');
}

main().finally(() => prisma.$disconnect());
