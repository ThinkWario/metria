import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
    const adminEmail = 'admin@metria.com'
    const targetEmail = 'wario.jorquera@gmail.com'
    const password = 'metria2025' // Misma contraseña que admin

    console.log(`Buscando usuario admin: ${adminEmail}...`)
    const admin = await prisma.user.findUnique({
        where: { email: adminEmail }
    })

    if (!admin || !admin.workspaceId) {
        console.error('No se encontró el usuario admin o no tiene workspace asignado.')
        return
    }

    console.log(`Admin encontrado en workspace: ${admin.workspaceId}`)
    const passwordHash = await bcrypt.hash(password, 10)

    console.log(`Actualizando/Creando usuario ${targetEmail}...`)
    const user = await prisma.user.upsert({
        where: { email: targetEmail },
        update: {
            workspaceId: admin.workspaceId,
            passwordHash: passwordHash,
            role: 'ADMIN', // Lo ponemos como admin del workspace
            name: 'Wario Jorquera'
        },
        create: {
            email: targetEmail,
            name: 'Wario Jorquera',
            passwordHash: passwordHash,
            workspaceId: admin.workspaceId,
            role: 'ADMIN'
        }
    })

    console.log('✅ Usuario configurado correctamente:')
    console.log(JSON.stringify(user, null, 2))
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
