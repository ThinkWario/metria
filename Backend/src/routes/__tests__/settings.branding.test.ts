import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

vi.mock('../../lib/prisma', () => ({
  prisma: {
    workspace: {
      findUnique: vi.fn()
    }
  }
}))

vi.mock('../../middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: 'u1', workspaceId: 'ws1', role: 'ADMIN' }
    next()
  }
}))

import settingsRouter from '../settings'
import { prisma } from '../../lib/prisma'

beforeEach(() => vi.clearAllMocks())

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/settings', settingsRouter)
  return app
}

describe('GET /api/settings/branding', () => {
  it('includes hiddenMenuItems in the response', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({
      name: 'Acme', logoUrl: null, primaryColor: '#7c3aed', brandName: 'Acme Co',
      hiddenMenuItems: ['nav:tiktok-ads', 'integration:shopify']
    } as any)

    const res = await request(buildApp()).get('/api/settings/branding').expect(200)

    expect(res.body.hiddenMenuItems).toEqual(['nav:tiktok-ads', 'integration:shopify'])
    expect(prisma.workspace.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ hiddenMenuItems: true })
      })
    )
  })
})
