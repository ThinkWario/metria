import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    const user = await prisma.user.findUnique({
        where: { email: 'admin@metria.com' },
        include: {
            workspace: {
                include: {
                    integrations: {
                        where: { platform: 'google' }
                    }
                }
            }
        }
    })

    if (!user) {
        console.log('User admin@metria.com not found')
        return
    }

    console.log('User Found:', user.email)
    console.log('Workspace:', user.workspace?.name)
    
    const googleIntegration = user.workspace?.integrations[0]
    if (googleIntegration) {
        console.log('Google Integration Config:', JSON.stringify(googleIntegration.config, null, 2))
    } else {
        console.log('No Google integration found for this workspace.')
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
