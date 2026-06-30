import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

const { mockSendWelcomeEmail } = vi.hoisted(() => ({
  mockSendWelcomeEmail: vi.fn().mockResolvedValue(undefined)
}))
vi.mock('../../lib/mailer', () => ({ sendWelcomeEmail: mockSendWelcomeEmail }))

vi.mock('../../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({
        id: 'u1', email: 'new@example.com', name: 'New User', role: 'ADMIN',
        workspaceId: 'ws1', workspace: { id: 'ws1', status: 'ACTIVE' }
      })
    },
    workspace: { create: vi.fn().mockResolvedValue({ id: 'ws1' }) }
  }
}))

import authRouter from '../auth'
import { prisma } from '../../lib/prisma'

beforeEach(() => vi.clearAllMocks())

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/auth', authRouter)
  return app
}

describe('POST /api/auth/register', () => {
  it('sends a welcome email after creating the user', async () => {
    const app = buildApp()

    await request(app)
      .post('/api/auth/register')
      .send({ workspaceName: 'Acme', name: 'New User', email: 'new@example.com', password: 'longenough1' })
      .expect(201)

    expect(mockSendWelcomeEmail).toHaveBeenCalledWith('new@example.com', 'New User')
  })
})
