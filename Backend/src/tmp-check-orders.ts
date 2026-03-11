import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const orders = await prisma.order.findMany()
  console.log('Orders found:', orders.length)
  if (orders.length > 0) {
    console.log('Sample Order Workspace ID:', orders[0].workspaceId)
    console.log('Sample Order Status:', orders[0].financialStatus)
    console.log('Sample Order Line Items:', JSON.stringify(orders[0].lineItems, null, 2))
  }
  
  const workspaces = await prisma.workspace.findMany()
  console.log('Workspaces found:', workspaces.length)
  workspaces.forEach(w => console.log(`- ${w.id}: ${w.name}`))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
