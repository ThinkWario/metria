import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    const email = 'jorqueramarioalberto@gmail.com'
    const user = await prisma.user.findUnique({
        where: { email },
        include: { 
            workspace: {
                include: {
                    _count: true
                }
            },
            paymentLogs: true
        }
    })
    
    if (user) {
        console.log('--- User Found ---')
        console.log(JSON.stringify(user, null, 2))
        
        if (user.workspaceId) {
            const usersInWorkspace = await prisma.user.count({
                where: { workspaceId: user.workspaceId }
            })
            console.log(`\nUsers in same workspace: ${usersInWorkspace}`)
        }
    } else {
        console.log('User not found.')
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
