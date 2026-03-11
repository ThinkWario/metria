import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const integrations = await prisma.integration.findMany()
  
  if (integrations.length === 0) {
    console.log("No integrations found at all.")
    return
  }
  
  for (const integration of integrations) {
    console.log(`Integration ID: ${integration.id}, Platform: '${integration.platform}', Status: '${integration.status}'`)
  }
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
