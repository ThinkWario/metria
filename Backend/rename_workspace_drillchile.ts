import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Renombra el workspace de admin@metria.com a "DrillChile".
 * No existe endpoint de API para renombrar un workspace (solo super-admin
 * crea/suspende), por eso este script corre dentro del contenedor (con acceso a
 * la DB). Uso:  npx tsx rename_workspace_drillchile.ts
 */
async function main() {
  const email = 'admin@metria.com'
  const user = await prisma.user.findUnique({ where: { email }, include: { workspace: true } })
  if (!user?.workspaceId) {
    console.error('Usuario o workspace no encontrado para', email)
    return
  }

  const updated = await prisma.workspace.update({
    where: { id: user.workspaceId },
    data: { name: 'DrillChile' }
  })

  console.log(`✅ Workspace renombrado: "${user.workspace?.name}" -> "${updated.name}" (id ${updated.id})`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
