import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const products = await prisma.product.findMany()
  console.log(`Total Products: ${products.length}`)
  products.forEach(p => console.log(`SKU: ${p.sku}, WorkspaceId: ${p.workspaceId}`))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
