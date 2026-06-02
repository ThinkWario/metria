import { prisma } from '../../lib/prisma'
import { getIO } from '../../lib/socket'

/**
 * CRM Lifecycle Service
 * Handles the automatic categorization of contacts and deals based on inbound signals.
 */
export class LifecycleService {
  /**
   * Processes a "Signal" (message, order, ad click) and updates the CRM status.
   */
  public static async handleSignal(data: {
    workspaceId: string
    contactId: string
    platform: string
    content?: string
    metadata?: Record<string, any>
  }) {
    const { workspaceId, contactId, platform, content } = data
    const io = getIO()

    // 1. Detect Buy Intent (Simple version, ideally uses Gemini)
    const buyKeywords = ['precio', 'valor', 'cuanto cuesta', 'comprar', 'stock', 'disponible', 'envio', 'pago', 'link']
    const hasBuyIntent = content && buyKeywords.some(kw => content.toLowerCase().includes(kw))

    if (hasBuyIntent) {
      console.log(`[Lifecycle] Buy intent detected for contact ${contactId} via ${platform}`)
      
      // 2. Auto-create Deal if none exists for this contact in an open stage
      const existingDeal = await prisma.deal.findFirst({
        where: { contactId, status: 'OPEN', workspaceId }
      })

      if (!existingDeal) {
        // Find default pipeline and first stage
        const pipeline = await prisma.pipeline.findFirst({
          where: { workspaceId, isDefault: true },
          include: { stages: { orderBy: { order: 'asc' } } }
        })

        if (pipeline && pipeline.stages.length > 0) {
          const negotiationStage = pipeline.stages.find(s => s.name.toLowerCase().includes('negociación')) || pipeline.stages[0]
          
          const newDeal = await prisma.deal.create({
            data: {
              workspaceId,
              contactId,
              pipelineId: pipeline.id,
              stageId: negotiationStage.id,
              title: `Oportunidad: ${platform} Lead`,
              status: 'OPEN',
              value: 0 // Initial value unknown
            }
          })

          console.log(`[Lifecycle] New deal created: ${newDeal.id}`)

          // Notify UI
          io.to(`workspace:${workspaceId}`).emit('crm:deal:new', {
            deal: newDeal,
            contactId
          })

          // Create system message in conversation
          const conv = await prisma.conversation.findFirst({ where: { contactId, workspaceId } })
          if (conv) {
            await prisma.message.create({
              data: {
                workspaceId,
                conversationId: conv.id,
                direction: 'OUTBOUND',
                senderType: 'SYSTEM',
                content: '¡Intención de compra detectada! He creado un trato en el CRM automáticamente.',
                isInternal: true
              }
            })
            io.to(`workspace:${workspaceId}:conv:${conv.id}`).emit('message:new', {
                conversationId: conv.id,
                content: 'Intención de compra detectada',
                senderType: 'SYSTEM'
            })
          }
        }
      }
    }
  }

  /**
   * Updates contact status based on activity.
   */
  public static async updateContactActivity(contactId: string, workspaceId: string) {
    await prisma.contact.update({
      where: { id: contactId },
      data: { updatedAt: new Date() }
    })
  }
}
