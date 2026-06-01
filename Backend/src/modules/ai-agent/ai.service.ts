import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai'
import { prisma } from '../../lib/prisma'
import { updateContact } from '../crm/contact.service'
import { createDeal } from '../crm/pipeline.service'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '')

/**
 * Tools available for the AI Agent
 */
const tools = [
  {
    functionDeclarations: [
      {
        name: 'qualify_lead',
        description: 'Updates the contact status (LEAD, PROSPECT, CUSTOMER). Use PROSPECT when the lead shows clear intent to buy or asks for a quote.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            contactId: { type: SchemaType.STRING, description: 'The ID of the contact' },
            status: { type: SchemaType.STRING, description: 'The new status (LEAD, PROSPECT, CUSTOMER)' }
          },
          required: ['contactId', 'status']
        }
      },
      {
        name: 'create_deal',
        description: 'Creates a sales opportunity in the pipeline. Use when the lead is ready for a formal offer.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            contactId: { type: SchemaType.STRING, description: 'The ID of the contact' },
            title: { type: SchemaType.STRING, description: 'Brief title for the deal' },
            value: { type: SchemaType.NUMBER, description: 'Estimated value of the deal' }
          },
          required: ['contactId', 'title', 'value']
        }
      },
      {
        name: 'move_deal',
        description: 'Moves an active deal to a different stage in the pipeline. Use when a milestone is reached (e.g. quote sent, meeting scheduled).',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            contactId: { type: SchemaType.STRING, description: 'The ID of the contact' },
            stageName: { type: SchemaType.STRING, description: 'The name of the target stage (e.g. "Cotización", "Cita")' }
          },
          required: ['contactId', 'stageName']
        }
      },
      {
        name: 'handover_to_human',
        description: 'Disables the AI agent for this conversation and notifies a human agent. Use when requested or for complex issues.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            conversationId: { type: SchemaType.STRING, description: 'The ID of the conversation' }
          },
          required: ['conversationId']
        }
      },
      {
        name: 'search_catalog',
        description: 'Searches for products, prices and stock in the store catalog.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            query: { type: SchemaType.STRING, description: 'Search term for the product' }
          },
          required: ['query']
        }
      }
    ]
  }
]

export async function processAiResponse(
  workspaceId: string,
  conversationId: string,
  userContent: string
): Promise<string | null> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId, workspaceId },
    include: {
      contact: true,
      messages: { orderBy: { sentAt: 'asc' }, take: 10 },
      channel: { select: { platform: true } }
    }
  })

  if (!conversation || !conversation.isHandledByBot) return null

  // Fetch AI configuration
  const agent = await prisma.botAgent.findFirst({
    where: { workspaceId, isActive: true },
    orderBy: { createdAt: 'desc' }
  })

  if (!agent) return null

  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    tools: tools as any
  })

  const history = conversation.messages.map(msg => ({
    role: msg.senderType === 'CONTACT' ? 'user' : 'model',
    parts: [{ text: msg.content }]
  }))

  const products = await prisma.product.findMany({ where: { workspaceId }, take: 20 })
  const catalogContext = products.map(p => `${p.name}: $${p.price} (SKU: ${p.sku})`).join('\n')

  const systemInstruction = `Eres un agente de ventas experto llamado ${agent.name}.
Tu tono es ${agent.tone}.
Instrucciones base: ${agent.promptBase || 'Ayuda al cliente con sus dudas y trata de cerrar una venta.'}

Tu objetivo principal es mover al cliente a través del embudo de ventas:
1. Identificar necesidad.
2. Cotizar (usa search_catalog).
3. Agendar o cerrar.

Contexto del catálogo:
${catalogContext}

Información del cliente:
Nombre: ${conversation.contact?.name || 'Desconocido'}
Status actual: ${conversation.contact?.status || 'LEAD'}

Reglas:
1. Si el cliente quiere comprar o cotizar, califícalo como PROSPECT.
2. Si el cliente alcanza un hito (pide cotización, acepta visita), usa move_deal para posicionarlo en el pipeline.
3. Si el cliente pide hablar con un humano, usa handover_to_human.
4. Sé conciso y directo.
5. Usa search_catalog si necesitas más detalles de productos.
`

  const chat = model.startChat({
    history: history as any,
    systemInstruction: { role: 'system', parts: [{ text: systemInstruction }] }
  })

  const result = await chat.sendMessage(userContent)
  const response = result.response
  const call = response.functionCalls()?.[0]

  if (call) {
    const toolResult = await handleToolCall(workspaceId, conversationId, call)
    
    // Send tool result back to model to get final response
    const finalResult = await chat.sendMessage([{
      functionResponse: {
        name: call.name,
        response: toolResult
      }
    }])
    return finalResult.response.text()
  }

  return response.text()
}

async function handleToolCall(workspaceId: string, conversationId: string, call: any) {
  const { name, args } = call
  console.log(`[AI Agent] Tool call: ${name}`, args)

  try {
    switch (name) {
      case 'qualify_lead':
        await updateContact(workspaceId, args.contactId, { status: args.status })
        await logAiAction(workspaceId, conversationId, `Calificó al lead como ${args.status}`)
        return { success: true, message: `Status updated to ${args.status}` }

      case 'create_deal':
        const pipeline = await prisma.pipeline.findFirst({ where: { workspaceId, isDefault: true } })
        const stages = pipeline ? await prisma.pipelineStage.findMany({ where: { pipelineId: pipeline.id }, orderBy: { order: 'asc' } }) : []
        const firstStage = stages[0]

        if (!firstStage) return { success: false, error: 'No pipeline stages found' }

        await createDeal(workspaceId, {
          contactId: args.contactId,
          pipelineId: pipeline!.id,
          stageId: firstStage.id,
          title: args.title,
          value: args.value
        })
        await logAiAction(workspaceId, conversationId, `Creó una oportunidad: ${args.title} ($${args.value})`)
        return { success: true, deal: args.title }

      case 'move_deal':
        const deal = await prisma.deal.findFirst({
          where: { contactId: args.contactId, workspaceId, status: 'OPEN' },
          orderBy: { createdAt: 'desc' }
        })
        if (!deal) return { success: false, error: 'No active deal found for this contact' }

        const stage = await prisma.pipelineStage.findFirst({
          where: { pipelineId: deal.pipelineId, name: { contains: args.stageName, mode: 'insensitive' } }
        })
        if (!stage) return { success: false, error: `Stage "${args.stageName}" not found` }

        await prisma.deal.update({
          where: { id: deal.id },
          data: { stageId: stage.id }
        })
        await logAiAction(workspaceId, conversationId, `Movió el deal a la etapa: ${stage.name}`)
        return { success: true, newStage: stage.name }

      case 'handover_to_human':
        await prisma.conversation.update({
          where: { id: conversationId },
          data: { isHandledByBot: false }
        })
        await logAiAction(workspaceId, conversationId, 'Derivó la conversación a un agente humano')
        return { success: true, message: 'Handover complete' }

      case 'search_catalog':
        const matches = await prisma.product.findMany({
          where: {
            workspaceId,
            OR: [
              { name: { contains: args.query, mode: 'insensitive' } },
              { sku: { contains: args.query, mode: 'insensitive' } }
            ]
          },
          take: 5
        })
        return { products: matches.map(p => ({ name: p.name, price: p.price, sku: p.sku })) }

      default:
        return { error: 'Unknown tool' }
    }
  } catch (err: any) {
    console.error(`[AI Agent] Tool error in ${name}:`, err)
    return { error: err.message }
  }
}

async function logAiAction(workspaceId: string, conversationId: string, content: string) {
  await prisma.message.create({
    data: {
      workspaceId,
      conversationId,
      direction: 'OUTBOUND',
      senderType: 'SYSTEM',
      content,
      isInternal: true
    }
  })
}
