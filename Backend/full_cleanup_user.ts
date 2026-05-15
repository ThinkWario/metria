import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    const email = 'jorqueramarioalberto@gmail.com'
    
    console.log(`--- INICIO DE ELIMINACIÓN PARA: ${email} ---`)
    
    const user = await prisma.user.findUnique({
        where: { email },
        include: { workspace: true }
    })
    
    if (!user) {
        console.log('Usuario no encontrado. Nada que hacer.')
        return
    }
    
    const userId = user.id
    const workspaceId = user.workspaceId
    
    console.log(`Usuario ID: ${userId}`)
    if (workspaceId) {
        console.log(`Workspace ID: ${workspaceId}`)
    }
    
    // 1. Borrar logs de pago asociados al usuario o al workspace
    const paymentLogs = await prisma.paymentLog.deleteMany({
        where: {
            OR: [
                { userId: userId },
                ...(workspaceId ? [{ workspaceId: workspaceId }] : [])
            ]
        }
    })
    console.log(`Eliminados ${paymentLogs.count} logs de pago.`)
    
    // 2. Borrar las preferencias del usuario (aunque debería ser cascade, lo aseguramos)
    await prisma.userPreference.deleteMany({
        where: { userId: userId }
    })
    console.log('Preferencias de usuario eliminadas.')

    // 3. Si el usuario está en un workspace, ver cuántos usuarios hay
    if (workspaceId) {
        const otherUsers = await prisma.user.count({
            where: { 
                workspaceId: workspaceId,
                id: { not: userId }
            }
        })
        
        if (otherUsers === 0) {
            console.log('El workspace quedará huérfano. Eliminando workspace y todos sus datos relacionados...')
            // Borrar el usuario primero para no tener problemas de FK si hay algo raro
            await prisma.user.delete({ where: { id: userId } })
            console.log('Usuario eliminado.')
            
            // Borrar el workspace (esto debería activar cascada para Orders, AdSpend, DailyMetrics, Integrations, etc.)
            await prisma.workspace.delete({ where: { id: workspaceId } })
            console.log('Workspace y datos relacionados eliminados.')
        } else {
            console.log(`Existen otros ${otherUsers} usuarios en el workspace. Solo eliminando al usuario.`)
            await prisma.user.delete({ where: { id: userId } })
            console.log('Usuario eliminado.')
        }
    } else {
        await prisma.user.delete({ where: { id: userId } })
        console.log('Usuario eliminado (no tenía workspace).')
    }
    
    console.log('--- PROCESO COMPLETADO ---')
}

main()
    .catch(e => {
        console.error('Error durante la eliminación:', e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
