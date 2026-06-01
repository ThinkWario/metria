import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function simulateMessagingExperience() {
  console.log('🚀 [SIMULATION] Starting Messaging UX Audit...')

  // 1. Find or create a demo workspace
  const workspace = await prisma.workspace.findFirst({
    where: { name: { contains: 'Metria Demo' } }
  })

  if (!workspace) {
    console.error('❌ Demo workspace not found. Run seed first.')
    return
  }

  console.log(`📍 Targeting Workspace: ${workspace.name} (${workspace.id})`)

  // 2. Ensure we have the Channels configured in DB (simulating user setup)
  const platforms = ['WHATSAPP', 'INSTAGRAM', 'TELEGRAM']
  for (const p of platforms) {
    await prisma.channel.upsert({
      where: { workspaceId_platform: { workspaceId: workspace.id, platform: p } },
      update: { status: 'CONNECTED' },
      create: {
        workspaceId: workspace.id,
        platform: p,
        name: `${p} Demo Channel`,
        status: 'CONNECTED',
        config: { demo: true }
      }
    })
  }
  console.log('✅ Channels marked as CONNECTED in DB.')

  // 3. Create a Demo AI Agent if not exists
  await prisma.botAgent.upsert({
    where: { id: 'demo-agent' },
    update: { isActive: true },
    create: {
      id: 'demo-agent',
      workspaceId: workspace.id,
      name: 'Andromeda',
      tone: 'friendly',
      promptBase: 'Ayuda a los clientes con sus pedidos y dales la bienvenida.',
      isActive: true
    }
  })
  console.log('🤖 AI Agent "Andromeda" is ready.')

  console.log('\n--- UI/UX SIMULATION SEQUENCE ---\n')

  const testMessages = [
    { from: '+56912345678', name: 'Juan Perez', platform: 'WHATSAPP', text: 'Hola, me interesa el Limpiador Ultrasónico.' },
    { from: 'ig_user_99', name: 'Maria Jose', platform: 'INSTAGRAM', text: '¿Hacen envíos a regiones?' },
    { from: 'tg_123', name: 'Carlos Chat', platform: 'TELEGRAM', text: 'Quiero soporte con mi pedido #5021' }
  ]

  for (const msg of testMessages) {
    console.log(`📩 Simulating message from ${msg.name} via ${msg.platform}...`)
    
    // Simulate what the Webhook parsing would do internally
    const channel = await prisma.channel.findFirst({ where: { workspaceId: workspace.id, platform: msg.platform } })
    
    // 1. Create/Update Contact
    const contact = await prisma.contact.upsert({
      where: { workspaceId_phone: { workspaceId: workspace.id, phone: msg.from } }, // Simple match for demo
      update: { updatedAt: new Date() },
      create: {
        workspaceId: workspace.id,
        name: msg.name,
        phone: msg.from,
        source: msg.platform,
        status: 'LEAD'
      }
    })

    // 2. Create Conversation
    const conv = await prisma.conversation.upsert({
      where: { 
        workspaceId_channelId_externalId: { 
          workspaceId: workspace.id, 
          channelId: channel!.id, 
          externalId: msg.from 
        } 
      },
      update: { lastMessageAt: new Date(), messageCount: { increment: 1 } },
      create: {
        workspaceId: workspace.id,
        channelId: channel!.id,
        contactId: contact.id,
        externalId: msg.from,
        status: 'OPEN',
        isHandledByBot: true
      }
    })

    // 3. Create Message
    await prisma.message.create({
      data: {
        workspaceId: workspace.id,
        conversationId: conv.id,
        direction: 'INBOUND',
        senderType: 'CONTACT',
        senderId: contact.id,
        content: msg.text
      }
    })

    console.log(`✅ [SUCCESS] ${msg.name} is now in the Unified Inbox.`)
  }

  console.log('\n--- AUDIT COMPLETE ---')
  console.log('Result: 3 New leads created. Check the Dashboard Inbox.')
}

simulateMessagingExperience()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
