import { SchemaType } from '@google/generative-ai'
import { prisma } from '../../lib/prisma'
import { updateContact, updateQualification, addTag } from '../crm/contact.service'
import { createDeal, moveDeal } from '../crm/pipeline.service'
import { getProvider } from './providers/provider.factory'
import { compileSystemPrompt, compileResponderPrompt, compileQualifierPrompt, type AgentProfile, type CompileInput } from './promptCompiler'
import { retrieveRelevantChunks } from '../knowledge/retrieval.service'
import { getAvailableSlots, filterSlotsByCalendarBusy, scheduleAppointment, rescheduleAppointment } from '../scheduling/scheduling.service'
import { sanitizeResponse } from './responseSanitizer'
import { stripUnknownUrls, collectUrls } from './urlGuard'
import { blockLeakedInternals } from './codeLeakGuard'
import { QUALIFIER_SCHEMA, type QualifierOutput } from './qualifierSchema'
import type { ChatMessage, LLMProvider } from './providers/types'

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
  },
  {
    name: 'reschedule_appointment',
    description: "Reschedules the customer's existing appointment to a new confirmed time. Only use times returned by get_available_slots.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        newIsoDateTime: { type: SchemaType.STRING, description: 'ISO 8601 datetime for the new time' }
      },
      required: ['newIsoDateTime']
    }
  }
]

const RESPONDER_TOOL_NAMES = new Set(['search_catalog', 'get_available_slots', 'schedule_appointment', 'reschedule_appointment'])
/**
 * Split-path responder's tool surface — only tools whose results must be
 * reflected verbatim in the customer-facing text. The other 6 tools
 * (qualify_lead, create_deal, move_deal, update_qualification, tag_contact,
 * handover_to_human) are qualifier-only in the split path — see
 * qualifierSchema.ts and applyQualifierOutcome() below.
 */
const RESPONDER_TOOL_DECLARATIONS = toolDeclarations.filter(t => RESPONDER_TOOL_NAMES.has(t.name))

export async function processAiResponse(
  workspaceId: string,
  conversationId: string,
  userContent: string
): Promise<string | null> {
  if (process.env.AI_QUALIFIER_SPLIT_ENABLED === 'true') {
    return processAiResponseSplit(workspaceId, conversationId, userContent)
  }
  return processAiResponseLegacy(workspaceId, conversationId, userContent)
}

async function processAiResponseLegacy(
  workspaceId: string,
  conversationId: string,
  userContent: string
): Promise<string | null> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId, workspaceId },
    include: {
      contact: true,
      // latest 10 messages (not the oldest 10) — reversed back to chronological below
      messages: { orderBy: { sentAt: 'desc' }, take: 10 },
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

  const rawHistory = [...conversation.messages]
    .reverse() // fetched newest-first; restore chronological order
    .filter(m => !m.isInternal)
    .map(m => ({ role: m.senderType === 'CONTACT' ? 'user' as const : 'assistant' as const, content: m.content }))

  // Inbound messages are persisted before this runs, so the tail of the history
  // already contains the turn(s) covered by userContent (which may be a debounced
  // batch joined with newlines) — drop them to avoid sending the same turns twice.
  while (rawHistory.length > 0) {
    const last = rawHistory[rawHistory.length - 1]
    if (last.role === 'user' && userContent.includes(last.content)) rawHistory.pop()
    else break
  }

  // Merge consecutive same-role turns: providers expect alternating roles, and
  // rapid-fire customer messages produce consecutive user turns in the DB.
  const history: { role: 'user' | 'assistant'; content: string }[] = []
  for (const turn of rawHistory) {
    const prev = history[history.length - 1]
    if (prev && prev.role === turn.role) prev.content = `${prev.content}\n${turn.content}`
    else history.push({ ...turn })
  }

  const provider = getProvider(agent.provider)
  let result = await provider.chat({
    system,
    messages: [...history, { role: 'user', content: userContent }],
    tools: toolDeclarations
  })

  // tool loop (max 5 rounds to avoid infinite loops)
  let rounds = 0
  let handoverCalled = false
  const toolResultUrls = new Set<string>()
  while (result.toolCalls.length > 0 && rounds < 5) {
    const responses: { name: string; response: object }[] = []
    for (const call of result.toolCalls) {
      if (call.name === 'handover_to_human') handoverCalled = true
      const toolResult = await handleToolCall(workspaceId, conversationId, call)
      for (const url of collectUrls(toolResult)) toolResultUrls.add(url)
      responses.push({ name: call.name, response: toolResult })
    }
    result = await result.submitToolResults(responses)
    rounds++
  }
  // Handover already wrote a system message — suppress AI text reply to avoid duplicate
  if (handoverCalled) return null
  if (!result.text) return result.text
  return sanitizeResponse(stripUnknownUrls(result.text, toolResultUrls), profile?.languageGuard)
}

async function loadAiContext(workspaceId: string, conversationId: string, userContent: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId, workspaceId },
    include: {
      contact: true,
      messages: { orderBy: { sentAt: 'desc' }, take: 10 },
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

  const rawHistory = [...conversation.messages]
    .reverse()
    .filter(m => !m.isInternal)
    .map(m => ({ role: m.senderType === 'CONTACT' ? 'user' as const : 'assistant' as const, content: m.content }))

  while (rawHistory.length > 0) {
    const last = rawHistory[rawHistory.length - 1]
    if (last.role === 'user' && userContent.includes(last.content)) rawHistory.pop()
    else break
  }

  const history: ChatMessage[] = []
  for (const turn of rawHistory) {
    const prev = history[history.length - 1]
    if (prev && prev.role === turn.role) prev.content = `${prev.content}\n${turn.content}`
    else history.push({ ...turn })
  }

  return { conversation, agent, profile, knowledge, deal, history }
}

async function applyDealAction(
  workspaceId: string,
  contactId: string,
  action: NonNullable<QualifierOutput['deal']>
): Promise<void> {
  const pipeline = await prisma.pipeline.findFirst({ where: { workspaceId, isDefault: true } })
  if (!pipeline) throw new Error('No default pipeline found')

  if (action.action === 'create') {
    const stages = await prisma.pipelineStage.findMany({ where: { pipelineId: pipeline.id }, orderBy: { order: 'asc' } })
    const firstStage = stages[0]
    if (!firstStage) throw new Error('No pipeline stages found')
    await createDeal(workspaceId, {
      contactId,
      pipelineId: pipeline.id,
      stageId: firstStage.id,
      title: action.title ?? 'Oportunidad',
      value: action.value
    })
    return
  }

  if (!action.stageName) throw new Error('stageName required to move a deal')
  const deal = await prisma.deal.findFirst({ where: { contactId, workspaceId, status: 'OPEN' }, orderBy: { createdAt: 'desc' } })
  if (!deal) throw new Error('No active deal found for this contact')
  const stage = await prisma.pipelineStage.findFirst({
    where: { pipelineId: deal.pipelineId, name: { contains: action.stageName, mode: 'insensitive' } }
  })
  if (!stage) throw new Error(`Stage "${action.stageName}" not found`)
  await moveDeal(workspaceId, deal.id, stage.id)
}

async function applyQualifierOutcome(
  ctx: { workspaceId: string; conversationId: string; contactId: string },
  output: QualifierOutput
): Promise<void> {
  const failures: { field: string; error: unknown }[] = []
  const tryApply = async (field: string, fn: () => Promise<unknown>) => {
    try { await fn() } catch (error) { failures.push({ field, error }) }
  }

  if (output.qualification) {
    await tryApply('qualification', () => updateQualification(ctx.workspaceId, ctx.contactId, output.qualification!))
  }
  if (output.tags?.length) {
    await Promise.all(output.tags.map(tag => tryApply(`tag:${tag}`, () => addTag(ctx.workspaceId, ctx.contactId, tag))))
  }
  if (output.statusChange) {
    await tryApply('statusChange', () => updateContact(ctx.workspaceId, ctx.contactId, { status: output.statusChange }))
  }
  if (output.deal) {
    await tryApply('deal', () => applyDealAction(ctx.workspaceId, ctx.contactId, output.deal!))
  }

  if (failures.length > 0) {
    try {
      await prisma.auditLog.create({
        data: {
          workspaceId: ctx.workspaceId,
          source: 'ai-qualifier',
          event: 'partial_apply_failure',
          status: 'error',
          message: failures.map(f => f.field).join(', '),
          payload: {
            conversationId: ctx.conversationId,
            contactId: ctx.contactId,
            failures: failures.map(f => ({ field: f.field, error: String(f.error) }))
          }
        }
      })
    } catch (error) {
      console.error('[AI Agent] Failed to write ai-qualifier AuditLog:', error)
    }
  }
}

async function runResponder(params: {
  workspaceId: string
  conversationId: string
  system: string
  history: ChatMessage[]
  userContent: string
  provider: LLMProvider
}): Promise<{ text: string | null; toolResultUrls: Set<string> }> {
  let result = await params.provider.chat({
    system: params.system,
    messages: [...params.history, { role: 'user', content: params.userContent }],
    tools: RESPONDER_TOOL_DECLARATIONS
  })

  let rounds = 0
  const toolResultUrls = new Set<string>()
  while (result.toolCalls.length > 0 && rounds < 5) {
    const responses: { name: string; response: object }[] = []
    for (const call of result.toolCalls) {
      const toolResult = await handleToolCall(params.workspaceId, params.conversationId, call)
      for (const url of collectUrls(toolResult)) toolResultUrls.add(url)
      responses.push({ name: call.name, response: toolResult })
    }
    result = await result.submitToolResults(responses)
    rounds++
  }

  return { text: result.text, toolResultUrls }
}

async function processAiResponseSplit(
  workspaceId: string,
  conversationId: string,
  userContent: string
): Promise<string | null> {
  const ctx = await loadAiContext(workspaceId, conversationId, userContent)
  if (!ctx) return null
  const { agent, profile, knowledge, deal, history } = ctx
  const contact = ctx.conversation.contact as any

  const provider = getProvider(agent.provider)
  const promptAgent = { name: agent.name, tone: agent.tone, promptBase: agent.promptBase }

  const qualifierSystem = compileQualifierPrompt({ agent: promptAgent, profile, contact })
  const responderSystem = compileResponderPrompt({
    agent: promptAgent,
    profile,
    knowledgeChunks: knowledge.map(k => k.content),
    contact,
    deal: deal as any
  })

  const [qualifierSettled, responderSettled] = await Promise.allSettled([
    provider.extract<QualifierOutput>({
      system: qualifierSystem,
      messages: [...history, { role: 'user', content: userContent }],
      schema: QUALIFIER_SCHEMA
    }),
    runResponder({ workspaceId, conversationId, system: responderSystem, history, userContent, provider })
  ])

  let qualifierOutput: QualifierOutput | null = null
  if (qualifierSettled.status === 'fulfilled') qualifierOutput = qualifierSettled.value

  if (!qualifierOutput) {
    const reason = qualifierSettled.status === 'rejected' ? qualifierSettled.reason : 'extract() returned null'
    try {
      await prisma.auditLog.create({
        data: {
          workspaceId,
          source: 'ai-qualifier',
          event: 'extract_failed',
          status: 'error',
          message: String(reason),
          payload: { conversationId }
        }
      })
    } catch (error) {
      console.error('[AI Agent] Failed to write ai-qualifier AuditLog:', error)
    }
  } else if (contact) {
    await applyQualifierOutcome({ workspaceId, conversationId, contactId: contact.id }, qualifierOutput)
  } else {
    try {
      await prisma.auditLog.create({
        data: {
          workspaceId,
          source: 'ai-qualifier',
          event: 'skipped_no_contact',
          status: 'error',
          message: 'Qualifier produced output but conversation has no linked contact',
          payload: { conversationId }
        }
      })
    } catch (error) {
      console.error('[AI Agent] Failed to write ai-qualifier AuditLog:', error)
    }
  }

  if (responderSettled.status === 'rejected') throw responderSettled.reason
  const { text: responderText, toolResultUrls } = responderSettled.value

  if (qualifierOutput?.needsHuman?.value === true) {
    await prisma.conversation.update({ where: { id: conversationId }, data: { isHandledByBot: false } })
    await logAiAction(workspaceId, conversationId, qualifierOutput.needsHuman.reason ?? 'Derivó la conversación a un agente humano')
    return null
  }

  // Firm, unmanageable decline (see stopFollowUps rule in the qualifier prompt): the bot
  // still answers this turn, it just stops proactively nudging this lead afterward.
  if (qualifierOutput?.stopFollowUps?.value === true) {
    await prisma.conversation.update({ where: { id: conversationId }, data: { followUpsPaused: true } })
    const { cancelPendingFollowUps } = await import('./followup.service')
    await cancelPendingFollowUps(conversationId)
    await logAiAction(workspaceId, conversationId, qualifierOutput.stopFollowUps.reason ?? 'Dejó de insistir: el cliente rechazó la oferta')
  }

  if (!responderText) return responderText
  const guarded = blockLeakedInternals(responderText)
  return sanitizeResponse(stripUnknownUrls(guarded, toolResultUrls), profile?.languageGuard)
}

async function handleToolCall(workspaceId: string, conversationId: string, call: any) {
  const { name, args } = call
  console.log(`[AI Agent] Tool call: ${name}`, args)

  // Resolve real IDs from DB — prevent AI model from hallucinating contactId / conversationId
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { contactId: true }
  })
  const contactId = conv?.contactId ?? args.contactId

  try {
    switch (name) {
      case 'qualify_lead':
        await updateContact(workspaceId, contactId, { status: args.status })
        await logAiAction(workspaceId, conversationId, `Calificó al lead como ${args.status}`)
        return { success: true, message: `Status updated to ${args.status}` }

      case 'create_deal':
        const pipeline = await prisma.pipeline.findFirst({ where: { workspaceId, isDefault: true } })
        const stages = pipeline ? await prisma.pipelineStage.findMany({ where: { pipelineId: pipeline.id }, orderBy: { order: 'asc' } }) : []
        const firstStage = stages[0]

        if (!firstStage) return { success: false, error: 'No pipeline stages found' }

        await createDeal(workspaceId, {
          contactId,
          pipelineId: pipeline!.id,
          stageId: firstStage.id,
          title: args.title,
          value: args.value
        })
        await logAiAction(workspaceId, conversationId, `Creó una oportunidad: ${args.title} ($${args.value})`)
        return { success: true, deal: args.title }

      case 'move_deal':
        const deal = await prisma.deal.findFirst({
          where: { contactId, workspaceId, status: 'OPEN' },
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
        await updateQualification(workspaceId, contactId, {
          temperature: args.temperature, type: args.type, score: args.score, data: args.data
        })
        await logAiAction(workspaceId, conversationId, `Calificó al lead: ${args.temperature ?? ''} ${args.type ?? ''} score=${args.score ?? '-'}`)
        return { success: true }

      case 'tag_contact':
        await addTag(workspaceId, contactId, args.name, args.color ?? '#f59e0b')
        await logAiAction(workspaceId, conversationId, `Etiquetó al contacto: ${args.name}`)
        return { success: true }

      case 'get_available_slots': {
        const type = args.type ?? 'SITE_VISIT'
        const rawSlots = await getAvailableSlots(workspaceId, type, new Date(), 14)
        const slots = await filterSlotsByCalendarBusy(workspaceId, type, rawSlots)
        return { slots: slots.slice(0, 6).map(s => s.toISOString()) }
      }

      case 'schedule_appointment': {
        const type = args.type ?? 'SITE_VISIT'
        const appt = await scheduleAppointment(workspaceId, {
          contactId,
          type,
          scheduledAt: new Date(args.isoDateTime),
          createdBy: 'BOT'
        })

        // Best-effort: a Calendar sync / notification problem must never make the
        // agent report the booking itself as failed — the Appointment row above
        // already exists.
        try {
          const bookerContact = await prisma.contact.findUnique({
            where: { id: contactId },
            select: { name: true, email: true, phone: true }
          })
          const { syncAppointmentToCalendar } = await import('../scheduling/google-calendar.service')
          await syncAppointmentToCalendar(workspaceId, appt.id, {
            title: type === 'SITE_VISIT' ? `Visita técnica — ${bookerContact?.name ?? 'lead'}` : `Llamada — ${bookerContact?.name ?? 'lead'}`,
            startAt: appt.scheduledAt,
            durationMin: appt.durationMin,
            bookerName: bookerContact?.name ?? 'lead',
            bookerEmail: bookerContact?.email ?? null
          })

          const { notifyAppointmentEvent } = await import('../scheduling/appointment-notifications.service')
          await notifyAppointmentEvent(workspaceId, {
            contact: { id: contactId, name: bookerContact?.name ?? 'lead', phone: bookerContact?.phone ?? null },
            appointment: { type, scheduledAt: appt.scheduledAt, durationMin: appt.durationMin },
            kind: 'created',
            conversationId
          })
        } catch (err) {
          console.error('[AI Agent] Calendar sync / notify after schedule_appointment failed (non-blocking):', err)
        }

        await logAiAction(workspaceId, conversationId, `Agendó cita ${args.type} para ${args.isoDateTime}`)
        return { success: true, appointmentId: appt.id, scheduledAt: appt.scheduledAt }
      }

      case 'reschedule_appointment': {
        const active = await prisma.appointment.findFirst({
          where: { workspaceId, contactId, status: { in: ['SCHEDULED', 'CONFIRMED'] } },
          orderBy: { scheduledAt: 'asc' }
        })
        if (!active) return { success: false, error: 'No hay cita activa para reagendar' }

        const rescheduled = await rescheduleAppointment(workspaceId, active.id, new Date(args.newIsoDateTime))

        // Best-effort: a Calendar sync / notification problem must never make the
        // agent report the reschedule itself as failed — the update above already happened.
        try {
          const bookerContact = await prisma.contact.findUnique({
            where: { id: contactId },
            select: { name: true, phone: true }
          })
          if (rescheduled.googleEventId) {
            const { updateCalendarEvent } = await import('../scheduling/google-calendar.service')
            await updateCalendarEvent(workspaceId, rescheduled.googleEventId, {
              startAt: rescheduled.scheduledAt,
              durationMin: rescheduled.durationMin
            })
          }

          const { notifyAppointmentEvent } = await import('../scheduling/appointment-notifications.service')
          await notifyAppointmentEvent(workspaceId, {
            contact: { id: contactId, name: bookerContact?.name ?? 'lead', phone: bookerContact?.phone ?? null },
            appointment: { type: rescheduled.type, scheduledAt: rescheduled.scheduledAt, durationMin: rescheduled.durationMin },
            kind: 'rescheduled',
            oldScheduledAt: rescheduled.oldScheduledAt,
            conversationId
          })
        } catch (err) {
          console.error('[AI Agent] Calendar sync / notify after reschedule_appointment failed (non-blocking):', err)
        }

        await logAiAction(workspaceId, conversationId, `Reagendó cita ${rescheduled.type} para ${args.newIsoDateTime}`)
        return { success: true, appointmentId: rescheduled.id, scheduledAt: rescheduled.scheduledAt }
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
