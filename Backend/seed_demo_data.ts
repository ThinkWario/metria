import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function seedDemoData() {
  console.log('🌱 Seeding extended demo data for workspace-default...')

  const workspaceId = 'workspace-default'

  // 1. Get the admin user
  const admin = await prisma.user.findFirst({ where: { email: 'admin@metria.com' } })
  if (!admin) {
    console.error('❌ Admin user not found.')
    return
  }

  // 2. Create a Pipeline if not exists
  const pipeline = await prisma.pipeline.upsert({
    where: { workspaceId_name: { workspaceId, name: 'Ventas Directas' } },
    update: {},
    create: {
      workspaceId,
      name: 'Ventas Directas',
      isDefault: true
    }
  })

  // 3. Create Pipeline Stages
  const stages = [
    { name: 'Lead', order: 0 },
    { name: 'Cotización', order: 1 },
    { name: 'Negociación', order: 2 },
    { name: 'Cerrado Ganado', order: 3 }
  ]

  const createdStages = []
  for (const s of stages) {
    const stage = await prisma.pipelineStage.upsert({
      where: { pipelineId_name: { pipelineId: pipeline.id, name: s.name } },
      update: { order: s.order },
      create: {
        pipelineId: pipeline.id,
        name: s.name,
        order: s.order
      }
    })
    createdStages.push(stage)
  }

  // 4. Create some Deals for our simulated contacts
  const contacts = await prisma.contact.findMany({ where: { workspaceId } })
  
  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i]
    await prisma.deal.upsert({
        where: { id: `deal-demo-${contact.id}` },
        update: {},
        create: {
            id: `deal-demo-${contact.id}`,
            workspaceId,
            contactId: contact.id,
            pipelineId: pipeline.id,
            stageId: createdStages[i % createdStages.length].id,
            title: `Interés en ${i === 0 ? 'Limpiador' : 'Envíos'}`,
            value: 50000 + (i * 10000),
            status: 'OPEN'
        }
    })
  }

  // 5. Create some Tickets
  for (let i = 0; i < 2; i++) {
    await prisma.ticket.create({
        data: {
            workspaceId,
            contactId: contacts[i].id,
            title: i === 0 ? 'Problema con pago' : 'Duda sobre stock',
            description: 'El cliente reporta una inconsistencia en el flujo demo.',
            status: 'OPEN',
            priority: 'HIGH'
        }
    })
  }

  console.log('✅ Extended demo data seeded successfully.')
}

seedDemoData()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
