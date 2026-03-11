import { prisma } from '../lib/prisma';

async function main() {
    const products = await prisma.product.findMany();
    console.log('--- PRODUCTS IN DATABASE ---');
    console.table(products.map(p => ({
        SKU: p.sku,
        Name: p.name,
        Price: `$${Number(p.price).toFixed(2)}`,
        COGS: `$${Number(p.cogs).toFixed(2)}`
    })));
}

main().catch(console.error);
