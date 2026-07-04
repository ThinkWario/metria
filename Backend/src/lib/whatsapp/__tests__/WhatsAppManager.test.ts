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
  sendMessage = vi.fn(async () => undefined)
  getContactLidAndPhone = vi.fn(async (): Promise<Array<{ pn?: string; lid?: string }>> => [])
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
  LocalAuth: vi.fn()
}))

vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async () => 'data:image/png;base64,x') } }))

vi.mock('../../socket', () => ({
  getIO: vi.fn(() => ({ to: vi.fn().mockReturnThis(), emit: vi.fn() }))
}))

vi.mock('../../prisma', () => ({
  prisma: {
    channel: {
      findUnique: vi.fn(async () => null),
      upsert: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 0 }))
    }
  }
}))

import { WhatsAppSessionManager } from '../WhatsAppManager'

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
  it('recycles the session after MAX_HEALTH_FAILURES consecutive unhealthy checks', async () => {
    const client = await initAndGetReady()
    client.getState.mockResolvedValue('UNPAIRED')

    await vi.advanceTimersByTimeAsync(60_000) // 1st unhealthy check
    expect(client.destroy).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(60_000) // 2nd unhealthy check → recycle
    await vi.advanceTimersByTimeAsync(0)

    expect(client.destroy).toHaveBeenCalledTimes(1)
    // Recycling re-initializes in place — a new client should have been created.
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

  it('treats a getState() timeout as an unhealthy check', async () => {
    const client = await initAndGetReady()
    client.getState.mockImplementation(() => new Promise(() => {})) // never resolves

    await vi.advanceTimersByTimeAsync(60_000 + 15_000) // health check interval + getState timeout
    await vi.advanceTimersByTimeAsync(60_000 + 15_000)
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
