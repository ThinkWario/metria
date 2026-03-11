import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // Update a product to have very high COGS to trigger a margin alert
  const product = await prisma.product.findFirst()
  if (product) {
    console.log(`Updating product ${product.sku} to high COGS...`)
    await prisma.product.update({
      where: { id: product.id },
      data: {
        cogs: Number(product.price) * 0.9 // 10% gross margin, which after 15% adspend becomes negative margin
      }
    })
    console.log('Update complete.')
  } else {
    console.log('No products found.')
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
