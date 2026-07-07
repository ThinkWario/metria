import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import bcrypt from 'bcrypt'

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

describe('POST /api/auth/verify-email', () => {
  it('marks the user verified and returns a session token', async () => {
    const app = buildApp()
    vi.mocked(prisma.emailVerificationToken.findUnique).mockResolvedValue({
      id: 'evt1', userId: 'u1', token: 'goodtoken', expiresAt: new Date(Date.now() + 60_000)
    } as any)
    vi.mocked(prisma.user.update).mockResolvedValue({
      id: 'u1', email: 'new@example.com', role: 'ADMIN', workspaceId: 'ws1'
    } as any)

    const res = await request(app)
      .post('/api/auth/verify-email')
      .send({ token: 'goodtoken' })
      .expect(200)

    expect(res.body.token).toEqual(expect.any(String))
    expect(res.body.user).toEqual({ id: 'u1', email: 'new@example.com', role: 'ADMIN', workspaceId: 'ws1' })
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { emailVerified: true } })
    expect(prisma.emailVerificationToken.delete).toHaveBeenCalledWith({ where: { id: 'evt1' } })
  })

  it('rejects an expired token', async () => {
    const app = buildApp()
    vi.mocked(prisma.emailVerificationToken.findUnique).mockResolvedValue({
      id: 'evt1', userId: 'u1', token: 'oldtoken', expiresAt: new Date(Date.now() - 60_000)
    } as any)

    const res = await request(app)
      .post('/api/auth/verify-email')
      .send({ token: 'oldtoken' })
      .expect(400)

    expect(res.body.error).toBe('invalid_or_expired_token')
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('rejects an unknown token', async () => {
    const app = buildApp()
    vi.mocked(prisma.emailVerificationToken.findUnique).mockResolvedValue(null)

    const res = await request(app)
      .post('/api/auth/verify-email')
      .send({ token: 'nonexistent' })
      .expect(400)

    expect(res.body.error).toBe('invalid_or_expired_token')
  })
})

describe('POST /api/auth/resend-verification', () => {
  it('issues a new token and emails it when the user exists and is unverified', async () => {
    const app = buildApp()
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u1', email: 'new@example.com', name: 'New User', emailVerified: false
    } as any)

    const res = await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: 'new@example.com' })
      .expect(200)

    expect(res.body).toEqual({ message: 'if_exists_sent' })
    expect(prisma.emailVerificationToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } })
    expect(mockSendVerificationEmail).toHaveBeenCalled()
  })

  it('returns the same response when the user does not exist (no enumeration)', async () => {
    const app = buildApp()
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)

    const res = await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: 'ghost@example.com' })
      .expect(200)

    expect(res.body).toEqual({ message: 'if_exists_sent' })
    expect(mockSendVerificationEmail).not.toHaveBeenCalled()
  })

  it('returns the same response when the user is already verified (no email sent)', async () => {
    const app = buildApp()
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u1', email: 'new@example.com', name: 'New User', emailVerified: true
    } as any)

    const res = await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: 'new@example.com' })
      .expect(200)

    expect(res.body).toEqual({ message: 'if_exists_sent' })
    expect(mockSendVerificationEmail).not.toHaveBeenCalled()
  })
})

describe('POST /api/auth/login — unverified email', () => {
  it('returns requiresEmailVerification instead of a session token', async () => {
    const app = buildApp()
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u1', email: 'unverified@example.com', passwordHash: await bcrypt.hash('pw12345678', 10),
      emailVerified: false, mustChangePassword: false, role: 'ADMIN', workspaceId: 'ws1',
      workspace: { status: 'ACTIVE' }
    } as any)

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'unverified@example.com', password: 'pw12345678' })
      .expect(200)

    expect(res.body).toEqual({ requiresEmailVerification: true, email: 'unverified@example.com' })
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
