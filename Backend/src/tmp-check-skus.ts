import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const orders = await prisma.order.findMany()
  const skus = new Set()
  orders.forEach(o => {
    const items = o.lineItems as any[]
    if (items) items.forEach(i => skus.add(i.sku))
  })
  console.log('SKUs found in orders:', Array.from(skus))
  
  const products = await prisma.product.findMany()
  console.log('Product SKUs in DB:', products.map(p => p.sku))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
