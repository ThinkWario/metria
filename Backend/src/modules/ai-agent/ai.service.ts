import { SchemaType } from '@google/generative-ai'
import { prisma } from '../../lib/prisma'
import { updateContact, updateQualification, addTag } from '../crm/contact.service'
import { createDeal } from '../crm/pipeline.service'
import { getProvider } from './providers/provider.factory'
import { compileSystemPrompt, type AgentProfile } from './promptCompiler'
import { retrieveRelevantChunks } from '../knowledge/retrieval.service'
import { getAvailableSlots, scheduleAppointment } from '../scheduling/scheduling.service'

/**
 * Tools available for the AI Agent
 */
const toolDeclarations = [
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
  },
  {
    name: 'update_qualification',
    description: 'Records lead qualification: temperature (COLD/WARM/HOT), type (CURIOUS/QUOTING/READY_TO_BUY/POST_SALE), score 0-100, and answers to qualification questions as data {key: answer}. Call whenever you learn a qualification answer or intent changes.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        contactId: { type: SchemaType.STRING },
        temperature: { type: SchemaType.STRING, description: 'COLD | WARM | HOT' },
        type: { type: SchemaType.STRING, description: 'CURIOUS | QUOTING | READY_TO_BUY | POST_SALE' },
        score: { type: SchemaType.NUMBER, description: '0-100' },
        data: { type: SchemaType.OBJECT, description: 'Answers keyed by qualification question key' }
      },
      required: ['contactId']
    }
  },
  {
    name: 'tag_contact',
    description: 'Adds a tag to the contact for CRM segmentation (e.g. "lead-caliente", "financiamiento", "postventa").',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        contactId: { type: SchemaType.STRING },
        name: { type: SchemaType.STRING },
        color: { type: SchemaType.STRING, description: 'Optional hex color' }
      },
      required: ['contactId', 'name']
    }
  },
  {
    name: 'get_available_slots',
    description: 'Returns the next available appointment slots. Use BEFORE offering times to the customer.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: { type: { type: SchemaType.STRING, description: 'SITE_VISIT | CALL' } },
      required: ['type']
    }
  },
  {
    name: 'schedule_appointment',
    description: 'Books an appointment at a confirmed time. Only use times returned by get_available_slots.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        contactId: { type: SchemaType.STRING },
        isoDateTime: { type: SchemaType.STRING, description: 'ISO 8601 datetime' },
        type: { type: SchemaType.STRING, description: 'SITE_VISIT | CALL' }
      },
      required: ['contactId', 'isoDateTime', 'type']
    }
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

  const agent = await prisma.botAgent.findFirst({
    where: { workspaceId, isActive: true },
    orderBy: { createdAt: 'desc' }
  })
  if (!agent) return null

  const profile = ((agent as any).config?.profile ?? null) as AgentProfile | null
  const knowledge = await retrieveRelevantChunks(workspaceId, userContent).catch(() => [])

  const deal = conversation.contact
    ? await prisma.deal.findFirst({
        where: { contactId: conversation.contact.id, workspaceId, status: 'OPEN' },
        orderBy: { createdAt: 'desc' },
        include: { stage: true }
      })
    : null

  const system = compileSystemPrompt({
    agent: { name: agent.name, tone: agent.tone, promptBase: agent.promptBase },
    profile,
    knowledgeChunks: knowledge.map(k => k.content),
    contact: conversation.contact as any,
    deal: deal as any
  })

  const history = conversation.messages
    .filter(m => !m.isInternal)
    .map(m => ({ role: m.senderType === 'CONTACT' ? 'user' as const : 'assistant' as const, content: m.content }))

  const provider = getProvider(agent.provider)
  let result = await provider.chat({
    system,
    messages: [...history, { role: 'user', content: userContent }],
    tools: toolDeclarations
  })

  // tool loop (max 5 rounds to avoid infinite loops)
  let rounds = 0
  while (result.toolCalls.length > 0 && rounds < 5) {
    const responses: { name: string; response: object }[] = []
    for (const call of result.toolCalls) {
      const toolResult = await handleToolCall(workspaceId, conversationId, call)
      responses.push({ name: call.name, response: toolResult })
    }
    result = await result.submitToolResults(responses)
    rounds++
  }
  return result.text
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

      case 'update_qualification':
        await updateQualification(workspaceId, args.contactId, {
          temperature: args.temperature, type: args.type, score: args.score, data: args.data
        })
        await logAiAction(workspaceId, conversationId, `Calificó al lead: ${args.temperature ?? ''} ${args.type ?? ''} score=${args.score ?? '-'}`)
        return { success: true }

      case 'tag_contact':
        await addTag(workspaceId, args.contactId, args.name, args.color ?? '#f59e0b')
        await logAiAction(workspaceId, conversationId, `Etiquetó al contacto: ${args.name}`)
        return { success: true }

      case 'get_available_slots': {
        const slots = await getAvailableSlots(workspaceId, args.type ?? 'SITE_VISIT', new Date(), 14)
        return { slots: slots.slice(0, 6).map(s => s.toISOString()) }
      }

      case 'schedule_appointment': {
        const appt = await scheduleAppointment(workspaceId, {
          contactId: args.contactId,
          type: args.type ?? 'SITE_VISIT',
          scheduledAt: new Date(args.isoDateTime),
          createdBy: 'BOT'
        })
        await logAiAction(workspaceId, conversationId, `Agendó cita ${args.type} para ${args.isoDateTime}`)
        return { success: true, appointmentId: appt.id, scheduledAt: appt.scheduledAt }
      }

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
