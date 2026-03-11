import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const metaIntegrations = await prisma.integration.findMany({
    where: { platform: 'META' }
  })
  
  if (metaIntegrations.length === 0) {
    console.log("No META integrations found.")
    return
  }
  
  for (const integration of metaIntegrations) {
    console.log(`Workspace ID: ${integration.workspaceId}`)
    console.log(`Status: ${integration.status}`)
    console.log(`Last Sync: ${integration.lastSync}`)
    const config = integration.config as Record<string, any>
    console.log(`Config present: ${!!config}`)
    if (config) {
      console.log(`Access Token present: ${!!config.accessToken}`)
      console.log(`Ad Account ID present: ${!!config.adAccountId}`)
    }
    
    // Check if there is data gathered
    const adSpends = await prisma.adSpend.count({
      where: { workspaceId: integration.workspaceId, platform: 'META' }
    })
    console.log(`AdSpends stored: ${adSpends}`)
    console.log("-------------------------------------------------")
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
