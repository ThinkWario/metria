import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const product = await prisma.product.findFirst({ where: { sku: 'HOG-001-A' } })
  console.log('Product HOG-001-A WorkspaceId:', product?.workspaceId)
  
  const allOrders = await prisma.order.findMany()
  const matchingOrder = allOrders.find(o => {
    const items = o.lineItems as any[]
    return items && items.find(i => i.sku === 'HOG-001-A')
  })
  console.log('Order for HOG-001-A WorkspaceId:', matchingOrder?.workspaceId)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
