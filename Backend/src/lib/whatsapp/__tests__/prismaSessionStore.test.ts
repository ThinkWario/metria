import { describe, it, expect, vi, beforeEach } from 'vitest'
import { promises as fs } from 'fs'

vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn()
  }
}))

vi.mock('../../prisma', () => ({
  prisma: {
    whatsAppSession: {
      findUnique: vi.fn(),
      upsert: vi.fn(async () => ({})),
      deleteMany: vi.fn(async () => ({ count: 0 }))
    }
  }
}))

import { PrismaWhatsAppStore } from '../prismaSessionStore'
import { prisma } from '../../prisma'

const WORKSPACE_ID = 'ws-1'
const DATA_PATH = '/app/.wwebjs_auth'
const SESSION = 'RemoteAuth-ws-1'

beforeEach(() => vi.clearAllMocks())

describe('PrismaWhatsAppStore', () => {
  it('sessionExists reflects whether a row exists for the session key', async () => {
    const store = new PrismaWhatsAppStore(WORKSPACE_ID, DATA_PATH)
    vi.mocked(prisma.whatsAppSession.findUnique).mockResolvedValueOnce({ id: 'row-1' } as any)
    expect(await store.sessionExists({ session: SESSION })).toBe(true)

    vi.mocked(prisma.whatsAppSession.findUnique).mockResolvedValueOnce(null)
    expect(await store.sessionExists({ session: SESSION })).toBe(false)
  })

  it('save reads the zip RemoteAuth wrote at <dataPath>/<session>.zip and upserts it by session', async () => {
    const store = new PrismaWhatsAppStore(WORKSPACE_ID, DATA_PATH)
    const fakeZip = Buffer.from('zip-bytes')
    vi.mocked(fs.readFile).mockResolvedValueOnce(fakeZip as any)

    await store.save({ session: SESSION })

    expect(fs.readFile).toHaveBeenCalledWith(`${DATA_PATH}/${SESSION}.zip`)
    expect(prisma.whatsAppSession.upsert).toHaveBeenCalledWith({
      where: { session: SESSION },
      create: { workspaceId: WORKSPACE_ID, session: SESSION, data: fakeZip },
      update: { data: fakeZip }
    })
  })

  it('extract writes the stored bytes to the path RemoteAuth asks for', async () => {
    const store = new PrismaWhatsAppStore(WORKSPACE_ID, DATA_PATH)
    const stored = Buffer.from('stored-bytes')
    vi.mocked(prisma.whatsAppSession.findUnique).mockResolvedValueOnce({ data: stored } as any)

    await store.extract({ session: SESSION, path: '/tmp/out.zip' })

    expect(fs.writeFile).toHaveBeenCalledWith('/tmp/out.zip', stored)
  })

  it('extract throws when no session is stored, instead of silently writing nothing', async () => {
    const store = new PrismaWhatsAppStore(WORKSPACE_ID, DATA_PATH)
    vi.mocked(prisma.whatsAppSession.findUnique).mockResolvedValueOnce(null)

    await expect(store.extract({ session: SESSION, path: '/tmp/out.zip' })).rejects.toThrow()
    expect(fs.writeFile).not.toHaveBeenCalled()
  })

  it('delete removes the stored session row', async () => {
    const store = new PrismaWhatsAppStore(WORKSPACE_ID, DATA_PATH)
    await store.delete({ session: SESSION })
    expect(prisma.whatsAppSession.deleteMany).toHaveBeenCalledWith({ where: { session: SESSION } })
  })
})
