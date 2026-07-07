import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

const { mockSendWelcomeEmail, mockSendVerificationEmail } = vi.hoisted(() => ({
  mockSendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
  mockSendVerificationEmail: vi.fn().mockResolvedValue(undefined)
}))
vi.mock('../../lib/mailer', () => ({
  sendWelcomeEmail: mockSendWelcomeEmail,
  sendVerificationEmail: mockSendVerificationEmail
}))

vi.mock('../../lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({
        id: 'u1', email: 'new@example.com', name: 'New User', role: 'ADMIN',
        workspaceId: 'ws1', workspace: { id: 'ws1', status: 'ACTIVE' }
      }),
      update: vi.fn()
    },
    workspace: { create: vi.fn().mockResolvedValue({ id: 'ws1' }) },
    emailVerificationToken: {
      create: vi.fn().mockResolvedValue({ id: 'evt1', token: 'faketoken123' }),
      findUnique: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn()
    }
  }
}))

import authRouter from '../auth'
import { prisma } from '../../lib/prisma'

vi.mock('google-auth-library', () => ({
  OAuth2Client: vi.fn().mockImplementation(function () {
    return {
      verifyIdToken: vi.fn().mockRejectedValue(
        new Error('Wrong recipient, payload audience != requiredAudience')
      )
    }
  })
}))

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

  it('does not return a session token; returns requiresEmailVerification instead', async () => {
    const app = buildApp()

    const res = await request(app)
      .post('/api/auth/register')
      .send({ workspaceName: 'Acme', name: 'New User', email: 'new@example.com', password: 'longenough1' })
      .expect(201)

    expect(res.body).toEqual({ requiresEmailVerification: true, email: 'new@example.com' })
    expect(res.body.token).toBeUndefined()
  })

  it('creates an EmailVerificationToken and emails a verify link', async () => {
    const app = buildApp()

    await request(app)
      .post('/api/auth/register')
      .send({ workspaceName: 'Acme', name: 'New User', email: 'new@example.com', password: 'longenough1' })
      .expect(201)

    expect(prisma.emailVerificationToken.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'u1' }) })
    )
    expect(mockSendVerificationEmail).toHaveBeenCalledWith(
      'new@example.com', 'New User', expect.stringContaining('/verify-email?token=')
    )
  })
})

describe('POST /api/auth/google — audience mismatch', () => {
  it('logs a clear client-id-mismatch diagnostic and returns a distinct error code', async () => {
    const app = buildApp()
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await request(app)
      .post('/api/auth/google')
      .send({ credential: 'fake-token' })
      .expect(401)

    expect(res.body.error).toBe('google_client_id_mismatch')
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('NEXT_PUBLIC_GOOGLE_CLIENT_ID')
    )
  })
})
