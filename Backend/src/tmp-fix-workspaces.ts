import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const workspaces = await prisma.workspace.findMany()
  console.log('Workspaces:')
  workspaces.forEach(w => console.log(`- ID: ${w.id}, Name: ${w.name}`))
  
  const orders = await prisma.order.findMany({ take: 1 })
  if (orders.length > 0) {
    console.log('Orders WorkspaceId:', orders[0].workspaceId)
    
    // Update all products to this workspaceId so they match the mock orders
    const count = await prisma.product.updateMany({
      data: { workspaceId: orders[0].workspaceId }
    })
    console.log(`Updated ${count.count} products to workspace ${orders[0].workspaceId}`)
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
