import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    conversation: { findUnique: vi.fn(async () => null) },
    botAgent: { findFirst: vi.fn(async () => null) },
    message: { create: vi.fn(async () => ({ id: 'note-1', sentAt: new Date() })) }
  }
}))

vi.mock('../../../lib/socket', () => ({
  getIO: vi.fn(() => ({ to: vi.fn().mockReturnThis(), emit: vi.fn() }))
}))

vi.mock('../ai.service', () => ({ processAiResponse: vi.fn() }))
vi.mock('../../messaging/message.service', () => ({ sendOutboundPlatformMessage: vi.fn(async () => undefined) }))
vi.mock('../../messaging/inbox.service', () => ({ trackAiMetric: vi.fn(async () => undefined) }))
vi.mock('../followup.service', () => ({ scheduleNextFollowUp: vi.fn(async () => undefined) }))

import { scheduleAiReply, generateAndSendAiReply, __resetAiResponderForTests, __getInFlightForTests } from '../aiResponder'
import { processAiResponse } from '../ai.service'
import { sendOutboundPlatformMessage } from '../../messaging/message.service'
import { prisma } from '../../../lib/prisma'
import { getIO } from '../../../lib/socket'

const WORKSPACE_ID = 'ws-1'
const CHANNEL_ID = 'ch-1'

// aiResponder is deliberately fire-and-forget, so a test's background chain
// can still be running (blocked on a mock, a caught-and-logged error, etc.)
// after its own assertions have already run. A UNIQUE conversation ID per
// test means that lingering tail can never collide with another test's
// state — without this, two tests sharing one hardcoded ID have been
// observed to race: one test's finally-block cleanup deletes-by-key the
// NEXT test's freshly-created entry for that same ID.
let conversationId: string
let counter = 0

function schedule(content: string) {
  scheduleAiReply({ workspaceId: WORKSPACE_ID, conversationId, channelId: CHANNEL_ID, content })
}

// Fires pending fake timers one at a time (vi.getTimerCount() is exact —
// unlike guessing ms amounts or looping a fixed number of times) until
// nothing is scheduled AND no generation is still in flight.
async function runToCompletion() {
  for (let i = 0; i < 200; i++) {
    if (vi.getTimerCount() > 0) {
      await vi.advanceTimersToNextTimerAsync()
      continue
    }
    if (__getInFlightForTests(conversationId)) {
      // No timer pending, but the generation hasn't settled yet — still
      // working through microtask hops (send/metric/follow-up).
      await Promise.resolve()
      continue
    }
    return
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  __resetAiResponderForTests()
  conversationId = `conv-${++counter}`
})

afterEach(() => {
  // Cancel, don't fire, whatever the test left pending — a test may deliberately
  // leave a generation mid-flight to assert on intermediate state. Firing it
  // here would start new (uninstrumented) work.
  vi.clearAllTimers()
  __resetAiResponderForTests()
  vi.useRealTimers()
})

describe('scheduleAiReply', () => {
  it('batches messages that arrive within the debounce window into a single generation', async () => {
    vi.mocked(processAiResponse).mockResolvedValueOnce('Una respuesta')

    schedule('Hola')
    schedule('¿Están en San Joaquín?')
    schedule('Bkn')

    expect(processAiResponse).not.toHaveBeenCalled()

    await runToCompletion()

    expect(processAiResponse).toHaveBeenCalledTimes(1)
    expect(processAiResponse).toHaveBeenCalledWith(
      WORKSPACE_ID, conversationId, 'Hola\n¿Están en San Joaquín?\nBkn'
    )
    expect(sendOutboundPlatformMessage).toHaveBeenCalledWith(WORKSPACE_ID, conversationId, 'Una respuesta', 'BOT')
  })

  it('serializes: a message arriving mid-generation is drained after, never runs concurrently', async () => {
    // A manually-controlled promise (not a mock auto-resolving via fake timers)
    // needs a deterministic completion signal rather than guessed timer/
    // microtask advancement — __getInFlightForTests gives us exactly that.
    let resolveFirst!: (v: string | null) => void
    const firstGeneration = new Promise<string | null>(res => { resolveFirst = res })
    vi.mocked(processAiResponse)
      .mockReturnValueOnce(firstGeneration)
      .mockResolvedValueOnce('Segunda respuesta')

    schedule('Primer mensaje')
    await vi.advanceTimersToNextTimerAsync() // fires the debounce timer, starts generation 1
    expect(processAiResponse).toHaveBeenCalledTimes(1) // in flight, unresolved

    // A message arrives while the first generation is still running.
    schedule('Mensaje mientras pensaba')
    expect(processAiResponse).toHaveBeenCalledTimes(1) // must NOT start a second concurrent call

    resolveFirst('Primera respuesta')
    // Deterministically wait for generation 1's entire chain (send/metric/
    // follow-up + flush's finally block re-arming the drain timer) to finish —
    // no setTimeout is involved in this tail, so no timer advance is needed.
    await __getInFlightForTests(conversationId)

    // Fires the drain re-arm timer, runs generation 2 to full completion.
    await runToCompletion()

    expect(processAiResponse).toHaveBeenCalledTimes(2)
    expect(processAiResponse).toHaveBeenNthCalledWith(2, WORKSPACE_ID, conversationId, 'Mensaje mientras pensaba')
  })

  it('retries transient provider failures before succeeding', async () => {
    vi.mocked(processAiResponse)
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce('Al tercer intento')

    schedule('Hola')
    await runToCompletion() // debounce → attempt 1&2 fail, backoff sleeps → attempt 3 succeeds → send

    expect(processAiResponse).toHaveBeenCalledTimes(3)
    expect(sendOutboundPlatformMessage).toHaveBeenCalledWith(WORKSPACE_ID, conversationId, 'Al tercer intento', 'BOT')
  })

  it('gives up after max attempts and leaves an internal failure note instead of dropping the customer', async () => {
    vi.mocked(processAiResponse).mockRejectedValue(new Error('provider down'))
    const mockIO = { to: vi.fn().mockReturnThis(), emit: vi.fn() }
    vi.mocked(getIO).mockReturnValue(mockIO as any)

    schedule('Hola')
    await runToCompletion()

    expect(processAiResponse).toHaveBeenCalledTimes(3)
    expect(sendOutboundPlatformMessage).not.toHaveBeenCalled()
    expect(prisma.message.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        conversationId,
        senderType: 'SYSTEM',
        isInternal: true
      })
    }))
    expect(mockIO.emit).toHaveBeenCalledWith('ai:failure', { conversationId })
  })

  it('does nothing when the AI intentionally stays silent (handover, disabled, no agent)', async () => {
    vi.mocked(processAiResponse).mockResolvedValueOnce(null)

    schedule('Hola')
    await runToCompletion()

    expect(sendOutboundPlatformMessage).not.toHaveBeenCalled()
    expect(prisma.message.create).not.toHaveBeenCalled()
  })

  it('drops an identical consecutive duplicate message before combining', async () => {
    vi.mocked(processAiResponse).mockResolvedValueOnce('Una respuesta')

    schedule('Hola')
    schedule('Hola') // WhatsApp redelivery of the same bubble
    schedule('¿Tienen stock?')

    await runToCompletion()

    expect(processAiResponse).toHaveBeenCalledWith(
      WORKSPACE_ID, conversationId, 'Hola\n¿Tienen stock?'
    )
  })

  it('does not start a generation when every queued message was a duplicate or blank', async () => {
    schedule('  ')
    schedule('  ')

    await runToCompletion()

    expect(processAiResponse).not.toHaveBeenCalled()
  })
})

describe('generateAndSendAiReply', () => {
  it('generates and sends immediately, bypassing the debounce queue entirely', async () => {
    vi.mocked(processAiResponse).mockResolvedValueOnce('Claro, coordinemos otro día')

    // Resolves without ever needing to advance the fake debounce timer —
    // proof the 8s debounce window was bypassed entirely.
    await generateAndSendAiReply(WORKSPACE_ID, conversationId, CHANNEL_ID, 'Podemos coordinar para otro día?')

    expect(processAiResponse).toHaveBeenCalledWith(WORKSPACE_ID, conversationId, 'Podemos coordinar para otro día?')
    expect(sendOutboundPlatformMessage).toHaveBeenCalledWith(WORKSPACE_ID, conversationId, 'Claro, coordinemos otro día', 'BOT')
  })

  it('reports failure the same way as the queued path when every retry fails', async () => {
    vi.mocked(processAiResponse).mockRejectedValue(new Error('provider down'))

    const done = generateAndSendAiReply(WORKSPACE_ID, conversationId, CHANNEL_ID, 'Hola')
    await vi.runAllTimersAsync() // drains the retry backoff sleeps
    await done

    expect(sendOutboundPlatformMessage).not.toHaveBeenCalled()
    expect(prisma.message.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ content: expect.stringContaining('no pudo responder') })
    }))
  })
})
