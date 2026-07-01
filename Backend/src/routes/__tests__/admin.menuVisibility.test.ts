import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

vi.mock('../../lib/prisma', () => ({
  prisma: {
    workspace: {
      findUnique: vi.fn(),
      update: vi.fn()
    }
  }
}))

vi.mock('../../middleware/adminAuth', () => ({
  requireSuperAdmin: [(req: any, _res: any, next: any) => {
    req.user = { id: 'admin1', role: 'SUPER_ADMIN' }
    next()
  }]
}))

import adminRouter from '../admin'
import { prisma } from '../../lib/prisma'

beforeEach(() => vi.clearAllMocks())

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/admin', adminRouter)
  return app
}

describe('PATCH /api/admin/workspaces/:id/menu-visibility', () => {
  it('updates hiddenMenuItems with valid keys', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ id: 'ws1' } as any)
    vi.mocked(prisma.workspace.update).mockResolvedValue({
      id: 'ws1', name: 'DrillChile', hiddenMenuItems: ['nav:tiktok-ads', 'integration:shopify']
    } as any)

    const res = await request(buildApp())
      .patch('/api/admin/workspaces/ws1/menu-visibility')
      .send({ hiddenMenuItems: ['nav:tiktok-ads', 'integration:shopify'] })
      .expect(200)

    expect(res.body.hiddenMenuItems).toEqual(['nav:tiktok-ads', 'integration:shopify'])
    expect(prisma.workspace.update).toHaveBeenCalledWith({
      where: { id: 'ws1' },
      data: { hiddenMenuItems: ['nav:tiktok-ads', 'integration:shopify'] },
      select: { id: true, name: true, hiddenMenuItems: true }
    })
  })

  it('rejects unknown keys with 400', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ id: 'ws1' } as any)

    const res = await request(buildApp())
      .patch('/api/admin/workspaces/ws1/menu-visibility')
      .send({ hiddenMenuItems: ['nav:not-a-real-key'] })
      .expect(400)

    expect(res.body.error).toMatch(/inválid/i)
    expect(prisma.workspace.update).not.toHaveBeenCalled()
  })

  it('returns 404 for an unknown workspace', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue(null)

    await request(buildApp())
      .patch('/api/admin/workspaces/does-not-exist/menu-visibility')
      .send({ hiddenMenuItems: [] })
      .expect(404)
  })
})
