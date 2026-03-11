import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true }
  })
  if (orders.length > 0) {
    console.log('Latest Order Date:', orders[0].createdAt)
    console.log('Oldest Order Date:', orders[orders.length - 1].createdAt)
  } else {
    console.log('No orders found.')
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
