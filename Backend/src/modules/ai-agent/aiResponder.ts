/**
 * Debounced, serialized AI reply pipeline.
 *
 * Inbound messages that arrive within a short window are grouped into a single
 * AI generation (customers often split one thought across several messages).
 * Only one generation runs per conversation at a time — messages arriving
 * mid-generation are answered in a follow-up pass instead of racing a second
 * call that would re-ask the same questions. Transient provider failures are
 * retried; permanent failures are surfaced in the inbox as an internal note
 * instead of silently dropping the customer.
 */
import { prisma } from '../../lib/prisma'
import { getIO } from '../../lib/socket'
import { processAiResponse } from './ai.service'

export const DEBOUNCE_MS = Number(process.env.AI_REPLY_DEBOUNCE_MS ?? 8000)
/** Re-arm delay when messages queued up while a generation was in flight. */
export const DRAIN_DELAY_MS = 1000
const MAX_ATTEMPTS = 3
const RETRY_BASE_DELAY_MS = 2000
/**
 * processAiResponse() calls the LLM provider and, via its tool loop, external
 * APIs (e.g. Google Calendar) with no timeout of their own — a stalled call
 * would otherwise hang this conversation forever instead of retrying or
 * reporting failure to a human.
 */
const AI_RESPONSE_TIMEOUT_MS = Number(process.env.AI_RESPONSE_TIMEOUT_MS ?? 30_000)

interface PendingReply {
  workspaceId: string
  channelId: string
  contents: string[]
  timer: NodeJS.Timeout | null
  processing: boolean
}

const pendingByConversation = new Map<string, PendingReply>()
/** Test-only: exposes the currently-running generation so tests can await the
 * exact completion signal instead of guessing timer/microtask counts. */
const inFlightByConversation = new Map<string, Promise<void>>()

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** Collapses consecutive identical messages (e.g. WhatsApp re-delivering the same bubble) before joining. */
function dedupeConsecutive(parts: string[]): string {
  const cleaned: string[] = []
  for (const raw of parts) {
    const part = raw.trim()
    if (!part) continue
    if (cleaned.length && cleaned[cleaned.length - 1] === part) continue
    cleaned.push(part)
  }
  return cleaned.join('\n')
}

export function scheduleAiReply(params: {
  workspaceId: string
  conversationId: string
  channelId: string
  content: string
}): void {
  const { workspaceId, conversationId, channelId, content } = params

  let state = pendingByConversation.get(conversationId)
  if (!state) {
    state = { workspaceId, channelId, contents: [], timer: null, processing: false }
    pendingByConversation.set(conversationId, state)
  }
  state.contents.push(content)

  // A generation is in flight: the finally-block in flush() drains the queue.
  if (state.processing) return

  if (state.timer) clearTimeout(state.timer)
  state.timer = setTimeout(() => { void flush(conversationId) }, DEBOUNCE_MS)
}

async function flush(conversationId: string): Promise<void> {
  const state = pendingByConversation.get(conversationId)
  if (!state || state.processing || state.contents.length === 0) return

  const combined = dedupeConsecutive(state.contents.splice(0))
  if (!combined) {
    if (state.contents.length > 0) {
      state.timer = setTimeout(() => { void flush(conversationId) }, DRAIN_DELAY_MS)
    } else {
      pendingByConversation.delete(conversationId)
    }
    return
  }

  state.processing = true
  state.timer = null

  const promise = generateAndSend(state.workspaceId, conversationId, state.channelId, combined)
  inFlightByConversation.set(conversationId, promise)
  try {
    await promise
  } finally {
    inFlightByConversation.delete(conversationId)
    state.processing = false
    if (state.contents.length > 0) {
      state.timer = setTimeout(() => { void flush(conversationId) }, DRAIN_DELAY_MS)
    } else {
      pendingByConversation.delete(conversationId)
    }
  }
}

async function generateAndSend(
  workspaceId: string,
  conversationId: string,
  channelId: string,
  userContent: string
): Promise<void> {
  let sent = false
  let lastError: unknown

  for (let attempt = 1; attempt <= MAX_ATTEMPTS && !sent; attempt++) {
    try {
      const aiResponse = await Promise.race([
        processAiResponse(workspaceId, conversationId, userContent),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('AI response timed out')), AI_RESPONSE_TIMEOUT_MS)
        )
      ])
      // null = intentionally silent (bot disabled, handover, no active agent)
      if (!aiResponse) return

      // Dynamic import breaks the circular dependency (message.service triggers this module).
      const { sendOutboundPlatformMessage } = await import('../messaging/message.service')
      await sendOutboundPlatformMessage(workspaceId, conversationId, aiResponse, 'BOT')
      sent = true
    } catch (err) {
      lastError = err
      console.error(`[AI Responder] Attempt ${attempt}/${MAX_ATTEMPTS} failed for conversation ${conversationId}:`, err)
      if (attempt < MAX_ATTEMPTS) await sleep(RETRY_BASE_DELAY_MS * attempt)
    }
  }

  if (!sent) {
    await reportFailure(workspaceId, conversationId, lastError)
    return
  }

  // Post-send bookkeeping must never trigger a re-send, so it lives outside the retry loop.
  try {
    const { trackAiMetric } = await import('../messaging/inbox.service')
    await trackAiMetric(workspaceId, channelId, 'botHandledCount')
  } catch (err) {
    console.error('[AI Responder] Failed to track metric:', err)
  }

  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { assignedToBotId: true }
    })
    const botId = conversation?.assignedToBotId
      ?? (await prisma.botAgent.findFirst({
        where: { workspaceId, isActive: true },
        orderBy: { createdAt: 'desc' },
        select: { id: true }
      }))?.id
    if (botId) {
      const { scheduleNextFollowUp } = await import('./followup.service')
      await scheduleNextFollowUp(workspaceId, conversationId, botId)
    }
  } catch (err) {
    console.error('[FollowUp] Failed to schedule follow-up:', err)
  }
}

/**
 * The AI could not answer after all retries: leave an internal note in the
 * conversation and notify connected agents so a human takes over — the
 * customer must never be left waiting silently.
 */
async function reportFailure(workspaceId: string, conversationId: string, err: unknown): Promise<void> {
  console.error(`[AI Responder] Giving up on conversation ${conversationId} after ${MAX_ATTEMPTS} attempts:`, err)
  try {
    const note = await prisma.message.create({
      data: {
        workspaceId,
        conversationId,
        direction: 'OUTBOUND',
        senderType: 'SYSTEM',
        content: '⚠️ El agente IA no pudo responder este mensaje. Revisa la conversación y responde manualmente.',
        isInternal: true
      }
    })
    const io = getIO()
    io.to(`workspace:${workspaceId}`).emit('message:new', {
      id: note.id,
      conversationId,
      direction: 'OUTBOUND',
      senderType: 'SYSTEM',
      content: note.content,
      isInternal: true,
      sentAt: note.sentAt
    })
    io.to(`workspace:${workspaceId}`).emit('ai:failure', { conversationId })
  } catch (persistErr) {
    console.error('[AI Responder] Failed to persist failure note:', persistErr)
  }
}

/** Test-only: clears debounce state between test cases. */
export function __resetAiResponderForTests(): void {
  for (const state of pendingByConversation.values()) {
    if (state.timer) clearTimeout(state.timer)
  }
  pendingByConversation.clear()
  inFlightByConversation.clear()
}

/** Test-only: the in-flight generation promise for a conversation, if any. */
export function __getInFlightForTests(conversationId: string): Promise<void> | undefined {
  return inFlightByConversation.get(conversationId)
}
