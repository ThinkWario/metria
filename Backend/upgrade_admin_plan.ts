import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const email = 'admin@metria.com'
  console.log(`Buscando usuario: ${email}`)
  
  const user = await prisma.user.findUnique({
    where: { email },
    include: { workspace: true }
  })

  if (!user) {
    console.error('Usuario no encontrado')
    return
  }

  if (!user.workspaceId) {
    console.error('El usuario no tiene un workspace asociado')
    return
  }

  console.log(`Actualizando workspace ${user.workspaceId} (${user.workspace?.name}) al plan SCALE...`)

  const updatedWorkspace = await prisma.workspace.update({
    where: { id: user.workspaceId },
    data: {
      plan: 'SCALE',
      subscriptionStatus: 'ACTIVE'
    }
  })

  console.log('¡Éxito! Workspace actualizado:', updatedWorkspace)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
