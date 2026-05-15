import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const workspaceId = 'workspace-default'
  
  console.log('Poblando base de datos con datos de prueba premium...')

  // 1. Asegurar que existe un Canal (WhatsApp)
  const channel = await prisma.channel.upsert({
    where: { workspaceId_platform: { workspaceId, platform: 'WHATSAPP' } },
    update: { status: 'CONNECTED' },
    create: {
      workspaceId,
      platform: 'WHATSAPP',
      name: 'WhatsApp Business',
      status: 'CONNECTED'
    }
  })

  // 2. Crear Contactos Realistas
  const contactData = [
    { name: 'Juan Pérez', email: 'juan.perez@gmail.com', status: 'VIP', ltv: 1500.50, source: 'SHOPIFY' },
    { name: 'María García', email: 'm.garcia@outlook.com', status: 'CUSTOMER', ltv: 450.20, source: 'META_AD' },
    { name: 'Carlos Rodríguez', email: 'crodriguez@gmail.com', status: 'LEAD', ltv: 0, source: 'GOOGLE_AD' },
    { name: 'Ana Martínez', email: 'ana.mtz@gmail.com', status: 'PROSPECT', ltv: 0, source: 'TIKTOK' },
    { name: 'Roberto Gómez', email: 'roberto.gomez@empresa.com', status: 'CUSTOMER', ltv: 890.00, source: 'MANUAL' },
  ]

  for (const c of contactData) {
    const contact = await prisma.contact.upsert({
      where: { workspaceId_email: { workspaceId, email: c.email } },
      update: { status: c.status, ltv: c.ltv },
      create: {
        workspaceId,
        name: c.name,
        email: c.email,
        status: c.status,
        ltv: c.ltv,
        source: c.source,
        phone: `+57300${Math.floor(1000000 + Math.random() * 9000000)}`,
      }
    })

    // 3. Crear una conversación para cada contacto
    const conversation = await prisma.conversation.create({
      data: {
        workspaceId,
        channelId: channel.id,
        contactId: contact.id,
        externalId: `ext_${contact.id}`,
        status: Math.random() > 0.5 ? 'OPEN' : 'PENDING',
        lastMessageAt: new Date(),
      }
    })

    // 4. Crear mensajes para la conversación
    await prisma.message.createMany({
      data: [
        {
          workspaceId,
          conversationId: conversation.id,
          content: 'Hola, me gustaría saber más sobre sus productos.',
          direction: 'INBOUND',
          senderType: 'CONTACT',
          sentAt: new Date(Date.now() - 3600000),
        },
        {
          workspaceId,
          conversationId: conversation.id,
          content: '¡Hola! Claro que sí, ¿en qué podemos ayudarte hoy?',
          direction: 'OUTBOUND',
          senderType: 'AGENT',
          sentAt: new Date(Date.now() - 1800000),
        }
      ]
    })
  }

  console.log('¡Base de datos poblada exitosamente!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
