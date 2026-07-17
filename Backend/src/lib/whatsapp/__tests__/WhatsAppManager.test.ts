import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'

/**
 * whatsapp-web.js drives a real Puppeteer/Chromium instance — unit tests
 * replace it with a lightweight EventEmitter that exposes the same on()/
 * initialize()/getState()/destroy() surface the manager calls, so watchdog
 * behavior (the actual bug fix: sessions going silently stale) can be
 * exercised without a browser.
 */
class FakeClient extends EventEmitter {
  initialize = vi.fn(async () => undefined)
  getState = vi.fn(async () => 'CONNECTED')
  destroy = vi.fn(async () => undefined)
  logout = vi.fn(async () => undefined)
  getChats = vi.fn(async () => [])
  getChatById = vi.fn(async () => ({
    sendStateTyping: vi.fn(async () => undefined),
    clearState: vi.fn(async () => undefined)
  }))
  sendMessage = vi.fn(async () => undefined)
  getContactLidAndPhone = vi.fn(async (): Promise<Array<{ pn?: string; lid?: string }>> => [])
  sendSeen = vi.fn(async () => true)
}

let lastCreatedClient: FakeClient | undefined
const createdClients: FakeClient[] = []

vi.mock('whatsapp-web.js', () => ({
  Client: vi.fn(function (this: unknown) {
    const instance = new FakeClient()
    lastCreatedClient = instance
    createdClients.push(instance)
    return instance
  }),
  RemoteAuth: vi.fn()
}))

vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async () => 'data:image/png;base64,x') } }))

vi.mock('../../socket', () => ({
  getIO: vi.fn(() => ({ to: vi.fn().mockReturnThis(), emit: vi.fn() }))
}))

vi.mock('../../prisma', () => ({
  prisma: {
    channel: {
      findUnique: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      upsert: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 0 }))
    },
    whatsAppSession: {
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async () => ({})),
      deleteMany: vi.fn(async () => ({ count: 0 }))
    }
  }
}))

vi.mock('../../../modules/messaging/message.service', () => ({
  processInboundMessage: vi.fn(async () => ({ conversationId: 'c1', messageId: 'm1', contactId: 'ct1', isNewConversation: false }))
}))

vi.mock('../../../modules/ai-agent/providers/gemini.provider', () => ({
  transcribeAudio: vi.fn(async () => 'hola quiero cotizar un panel solar')
}))

import { WhatsAppSessionManager } from '../WhatsAppManager'
import { prisma } from '../../prisma'
import { processInboundMessage } from '../../../modules/messaging/message.service'
import { transcribeAudio } from '../../../modules/ai-agent/providers/gemini.provider'

const manager = WhatsAppSessionManager.getInstance()

let workspaceId: string
let counter = 0

async function initAndGetReady(): Promise<FakeClient> {
  const initPromise = manager.initSession(workspaceId)
  await vi.advanceTimersByTimeAsync(0) // let initialize()'s microtask settle
  const client = lastCreatedClient!
  client.emit('ready')
  await vi.advanceTimersByTimeAsync(0) // let the 'ready' handler's async work run
  await initPromise
  return client
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  createdClients.length = 0
  lastCreatedClient = undefined
  workspaceId = `ws-${++counter}`
})

afterEach(async () => {
  await manager.destroySession(workspaceId).catch(() => {})
  vi.clearAllTimers()
  vi.useRealTimers()
})

describe('WhatsAppSessionManager watchdog', () => {
  it('recycles after MAX_HEALTH_FAILURES unhealthy checks, then re-initializes only after backoff', async () => {
    const client = await initAndGetReady()
    client.getState.mockResolvedValue('UNPAIRED')

    await vi.advanceTimersByTimeAsync(60_000) // 1st unhealthy check
    await vi.advanceTimersByTimeAsync(60_000) // 2nd unhealthy check
    expect(client.destroy).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(60_000) // 3rd unhealthy check → recycle
    await vi.advanceTimersByTimeAsync(0)

    expect(client.destroy).toHaveBeenCalledTimes(1)
    // Immediate re-login after every recycle is itself a ban signal — the
    // re-init is deferred until the backoff window elapses.
    expect(createdClients.length).toBe(1)

    await vi.advanceTimersByTimeAsync(60_000) // backoff elapsed → watchdog re-initializes
    expect(createdClients.length).toBe(2)
  })

  it('a single unhealthy check does not recycle, and a later healthy check resets the counter', async () => {
    const client = await initAndGetReady()
    client.getState.mockResolvedValueOnce('UNPAIRED') // 1 failure
    await vi.advanceTimersByTimeAsync(60_000)
    expect(client.destroy).not.toHaveBeenCalled()

    client.getState.mockResolvedValueOnce('CONNECTED') // resets failure count
    await vi.advanceTimersByTimeAsync(60_000)

    client.getState.mockResolvedValueOnce('UNPAIRED') // only 1 failure again, not 2 in a row
    await vi.advanceTimersByTimeAsync(60_000)
    await vi.advanceTimersByTimeAsync(0)

    expect(client.destroy).not.toHaveBeenCalled()
  })

  it('tolerates more consecutive getState() timeouts before recycling (slow host ≠ dead session)', async () => {
    const client = await initAndGetReady()
    client.getState.mockImplementation(() => new Promise(() => {})) // never resolves

    // 4 timeout-only failures: still under the timeout-only threshold.
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(60_000 + 15_000)
    }
    expect(client.destroy).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(60_000 + 15_000) // 5th → recycle
    await vi.advanceTimersByTimeAsync(0)

    expect(client.destroy).toHaveBeenCalledTimes(1)
  })

  it('stops watchdog checks entirely after a LOGOUT disconnect (user unlinked the device)', async () => {
    const client = await initAndGetReady()
    client.emit('disconnected', 'LOGOUT')
    await vi.advanceTimersByTimeAsync(0)

    client.getState.mockResolvedValue('UNPAIRED')
    await vi.advanceTimersByTimeAsync(600_000) // far more than enough time to have recycled if still armed

    expect(client.getState).not.toHaveBeenCalled()
    expect(client.destroy).not.toHaveBeenCalled()
  })

  it('self-heals by re-initializing when the client has vanished from the map', async () => {
    await initAndGetReady()
    // Simulate a non-LOGOUT disconnect: client removed from the map, but the
    // watchdog interval keeps running (matches the source's actual behavior).
    lastCreatedClient!.emit('disconnected', 'NAVIGATION')

    await vi.advanceTimersByTimeAsync(60_000)
    await vi.advanceTimersByTimeAsync(0)

    expect(createdClients.length).toBe(2) // the watchdog re-initialized a fresh client
  })
})

describe('QR exhaustion and auth failure (ban prevention)', () => {
  it('passes qrMaxRetries to the client so an unscanned session cannot request QRs forever', async () => {
    await initAndGetReady()
    const { Client } = await import('whatsapp-web.js')
    expect(vi.mocked(Client).mock.calls[0][0]).toMatchObject({ qrMaxRetries: 3 })
  })

  it('stops the watchdog and marks the channel NEEDS_QR when QR retries are exhausted', async () => {
    const initPromise = manager.initSession(workspaceId)
    await vi.advanceTimersByTimeAsync(0)
    const client = lastCreatedClient!
    client.emit('disconnected', 'Max qrcode retries reached')
    await vi.advanceTimersByTimeAsync(0)
    await initPromise

    expect(prisma.channel.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'NEEDS_QR' } })
    )

    // Watchdog must be disarmed: no autonomous re-init (which would start a
    // fresh endless QR stream) even long past the init grace period.
    await vi.advanceTimersByTimeAsync(20 * 60_000)
    expect(createdClients.length).toBe(1)
  })

  it('wipes the stored session, stops the watchdog and requires a new QR on auth_failure', async () => {
    const initPromise = manager.initSession(workspaceId)
    await vi.advanceTimersByTimeAsync(0)
    const client = lastCreatedClient!
    client.emit('auth_failure', 'invalid session')
    await vi.advanceTimersByTimeAsync(0)
    await initPromise

    // Retrying a corrupt/rejected session in a loop hammers WhatsApp with
    // failed logins — the stored blob must go and the loop must stop.
    expect(prisma.whatsAppSession.deleteMany).toHaveBeenCalledWith({ where: { workspaceId } })
    expect(prisma.channel.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'NEEDS_QR' } })
    )
    expect(client.destroy).toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(20 * 60_000)
    expect(createdClients.length).toBe(1)
  })
})

describe('re-init backoff schedule', () => {
  it('escalates exponentially and caps at the cooldown after the recycle limit', () => {
    const delay = (attempts: number) => (manager as any).reinitDelayMs(attempts)
    expect(delay(1)).toBe(60_000)
    expect(delay(2)).toBe(120_000)
    expect(delay(4)).toBe(480_000)
    expect(delay(5)).toBe(30 * 60_000)
    expect(delay(9)).toBe(30 * 60_000)
  })
})

describe('sendMessage typing simulation', () => {
  it('shows typing state and delays before sending (bot-like instant replies are a ban signal)', async () => {
    const client = await initAndGetReady()
    const chat = {
      sendStateTyping: vi.fn(async () => undefined),
      clearState: vi.fn(async () => undefined)
    }
    client.getChatById.mockResolvedValue(chat)

    const sendPromise = manager.sendMessage(workspaceId, '123@c.us', 'hola')
    await vi.advanceTimersByTimeAsync(0)
    expect(chat.sendStateTyping).toHaveBeenCalled()
    expect(client.sendMessage).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(10_000) // max typing delay comfortably covered
    await sendPromise
    expect(client.sendMessage).toHaveBeenCalledWith('123@c.us', 'hola')
    expect(chat.clearState).toHaveBeenCalled()
  })

  it('still sends if the typing simulation itself fails', async () => {
    const client = await initAndGetReady()
    client.getChatById.mockRejectedValue(new Error('page not ready'))

    const sendPromise = manager.sendMessage(workspaceId, '123@c.us', 'hola')
    await vi.advanceTimersByTimeAsync(10_000)
    await sendPromise
    expect(client.sendMessage).toHaveBeenCalledWith('123@c.us', 'hola')
  })
})

describe('autoRestoreSessions', () => {
  it('only restores channels that were CONNECTED — dead sessions must not re-enter the QR loop on boot', async () => {
    vi.mocked(prisma.channel.findMany).mockResolvedValue([] as any)
    await manager.autoRestoreSessions()
    expect(prisma.channel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { platform: 'WHATSAPP', status: 'CONNECTED' }
      })
    )
  })

  it('staggers Chromium launches on boot instead of starting them all at once', async () => {
    const ids = ['restore-a', 'restore-b', 'restore-c']
    vi.mocked(prisma.channel.findMany).mockResolvedValue(
      ids.map(id => ({ workspaceId: id, config: { isNative: true } })) as any
    )

    const restorePromise = manager.autoRestoreSessions()
    await vi.advanceTimersByTimeAsync(0)
    expect(createdClients.length).toBe(1) // only the first launched so far

    await vi.advanceTimersByTimeAsync(20_000)
    expect(createdClients.length).toBe(2)

    await vi.advanceTimersByTimeAsync(20_000)
    expect(createdClients.length).toBe(3)

    await restorePromise
    await Promise.all(ids.map(id => manager.destroySession(id)))
  })
})

// resolvePhone is private and there's no clean public synchronization point
// through the fire-and-forget 'message' event pipeline (handleInboundMessage
// isn't awaited by emit(), by design — matching production). Calling it
// directly via the `as any` escape hatch tests exactly the caching behavior
// that changed, deterministically, instead of fighting event-loop timing
// through several unrelated layers that are already covered elsewhere.
describe('resolvePhone lid resolution caching', () => {
  const lidChatId = '61645766283373@lid'

  it('caches a resolved phone so a second lookup for the same lid does not re-query WhatsApp', async () => {
    const client = await initAndGetReady()
    client.getContactLidAndPhone.mockResolvedValue([{ pn: '56966992259@c.us' }])

    const first = await (manager as any).resolvePhone(workspaceId, lidChatId)
    const second = await (manager as any).resolvePhone(workspaceId, lidChatId)

    expect(first).toBe('56966992259')
    expect(second).toBe('56966992259')
    expect(client.getContactLidAndPhone).toHaveBeenCalledTimes(1)
  })

  it('does not retry a failed lookup immediately, but does after the negative-cache cooldown', async () => {
    const client = await initAndGetReady()
    client.getContactLidAndPhone.mockResolvedValue([])

    const first = await (manager as any).resolvePhone(workspaceId, lidChatId)
    const second = await (manager as any).resolvePhone(workspaceId, lidChatId)
    expect(first).toBe('61645766283373')
    expect(second).toBe('61645766283373')
    expect(client.getContactLidAndPhone).toHaveBeenCalledTimes(1) // WhatsApp rate-limits this — don't spam a failing lookup

    await vi.advanceTimersByTimeAsync(15 * 60_000) // cooldown elapses
    const third = await (manager as any).resolvePhone(workspaceId, lidChatId)
    expect(third).toBe('61645766283373')
    expect(client.getContactLidAndPhone).toHaveBeenCalledTimes(2)
  })
})

describe('handleInboundMessage — voice notes', () => {
  function makeVoiceMsg(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      from: '56912345678@c.us',
      fromMe: false,
      body: '',
      type: 'ptt',
      id: { _serialized: 'wa-msg-1' },
      author: undefined,
      _data: {},
      downloadMedia: vi.fn(async () => ({ mimetype: 'audio/ogg; codecs=opus', data: 'QUJDRA==' })),
      ...overrides
    }
  }

  it('downloads and transcribes a voice note, then processes the transcript as content', async () => {
    const client = await initAndGetReady()
    vi.mocked(prisma.channel.findUnique).mockResolvedValue({ id: 'ch-1' } as any)
    const msg = makeVoiceMsg()

    await (manager as any).handleInboundMessage(workspaceId, msg)

    expect(msg.downloadMedia).toHaveBeenCalledTimes(1)
    expect(transcribeAudio).toHaveBeenCalledWith('QUJDRA==', 'audio/ogg; codecs=opus')
    expect(processInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'hola quiero cotizar un panel solar',
        mediaType: 'audio'
      })
    )
    expect(client.sendSeen).toHaveBeenCalledWith('56912345678@c.us')
  })

  it('drops the message without calling processInboundMessage when transcription fails', async () => {
    await initAndGetReady()
    vi.mocked(prisma.channel.findUnique).mockResolvedValue({ id: 'ch-1' } as any)
    vi.mocked(transcribeAudio).mockResolvedValueOnce('')
    const msg = makeVoiceMsg()

    await (manager as any).handleInboundMessage(workspaceId, msg)

    expect(processInboundMessage).not.toHaveBeenCalled()
  })

  it('still ignores a plain empty-body message that is not a voice note', async () => {
    await initAndGetReady()
    vi.mocked(prisma.channel.findUnique).mockResolvedValue({ id: 'ch-1' } as any)
    const msg = makeVoiceMsg({ type: 'chat', body: '' })

    await (manager as any).handleInboundMessage(workspaceId, msg)

    expect(msg.downloadMedia).not.toHaveBeenCalled()
    expect(processInboundMessage).not.toHaveBeenCalled()
  })
})
