import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    const email = 'jorqueramarioalberto@gmail.com'

    console.log(`Buscando usuario: ${email}...`)
    const user = await prisma.user.findUnique({
        where: { email },
        include: { workspace: true }
    })

    if (!user) {
        console.log('El usuario no existe en la base de datos.')
        return
    }

    console.log(`Usuario encontrado: ${user.id}`)

    // Si el usuario tiene un workspace y es el único usuario de ese workspace,
    // podríamos querer borrar el workspace también. Pero por ahora seamos cautelosos.
    
    // Eliminamos el usuario
    await prisma.user.delete({
        where: { id: user.id }
    })

    console.log(`✅ Registros del usuario ${email} eliminados correctamente.`)

    // Si quieres borrar también el workspace asociado si queda vacío:
    if (user.workspaceId) {
        const otherUsers = await prisma.user.count({
            where: { workspaceId: user.workspaceId }
        })
        if (otherUsers === 0) {
            console.log(`Borrando workspace huérfano: ${user.workspaceId}`)
            await prisma.workspace.delete({
                where: { id: user.workspaceId }
            })
            console.log('✅ Workspace eliminado.')
        }
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
