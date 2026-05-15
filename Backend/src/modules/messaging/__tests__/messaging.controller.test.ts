import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Request, Response } from 'express'
import { messengerWebhookVerify, messengerWebhook } from '../messaging.controller'
import { prisma } from '../../../lib/prisma'
import * as messengerService from '../channels/messenger.service'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    channel: {
      findFirst: vi.fn()
    }
  }
}))

vi.mock('../channels/messenger.service', () => ({
  verifyMessengerSignature: vi.fn(),
  parseMessengerUpdate: vi.fn().mockResolvedValue(undefined)
}))

describe('MessagingController - Messenger Webhooks', () => {
  let req: any
  let res: any

  beforeEach(() => {
    vi.clearAllMocks()
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      headersSent: false
    }
  })

  describe('messengerWebhookVerify', () => {
    it('should return challenge when verify_token matches', async () => {
      req = {
        params: { workspaceId: 'ws-1' },
        query: {
          'hub.mode': 'subscribe',
          'hub.verify_token': 'valid-token',
          'hub.challenge': 'challenge-123'
        }
      }
      vi.mocked(prisma.channel.findFirst).mockResolvedValue({
        id: 'ch-1',
        config: { verifyToken: 'valid-token' }
      } as any)

      await messengerWebhookVerify(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.send).toHaveBeenCalledWith('challenge-123')
    })

    it('should return 403 when verify_token is invalid', async () => {
      req = {
        params: { workspaceId: 'ws-1' },
        query: {
          'hub.mode': 'subscribe',
          'hub.verify_token': 'invalid-token',
          'hub.challenge': 'challenge-123'
        }
      }
      vi.mocked(prisma.channel.findFirst).mockResolvedValue({
        id: 'ch-1',
        config: { verifyToken: 'valid-token' }
      } as any)

      await messengerWebhookVerify(req, res)

      expect(res.status).toHaveBeenCalledWith(403)
      expect(res.send).toHaveBeenCalledWith('Forbidden')
    })

    it('should return 400 when hub.mode is not subscribe', async () => {
      req = {
        params: { workspaceId: 'ws-1' },
        query: {
          'hub.mode': 'invalid',
          'hub.verify_token': 'valid-token',
          'hub.challenge': 'challenge-123'
        }
      }
      vi.mocked(prisma.channel.findFirst).mockResolvedValue({
        id: 'ch-1',
        config: { verifyToken: 'valid-token' }
      } as any)

      await messengerWebhookVerify(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.send).toHaveBeenCalledWith('Bad request')
    })
  })

  describe('messengerWebhook', () => {
    it('should return 200 and parse update when signature is valid', async () => {
      req = {
        params: { workspaceId: 'ws-1' },
        headers: { 'x-hub-signature-256': 'sha256=valid-sig' },
        body: { object: 'page', entry: [] }
      }
      vi.mocked(prisma.channel.findFirst).mockResolvedValue({
        id: 'ch-1',
        config: { appSecret: 'secret' }
      } as any)
      vi.mocked(messengerService.verifyMessengerSignature).mockReturnValue(true)

      await messengerWebhook(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith({ ok: true })
      expect(messengerService.parseMessengerUpdate).toHaveBeenCalledWith('ws-1', 'ch-1', req.body)
    })

    it('should return 401 when signature is invalid', async () => {
      req = {
        params: { workspaceId: 'ws-1' },
        headers: { 'x-hub-signature-256': 'sha256=invalid-sig' },
        body: { object: 'page', entry: [] }
      }
      vi.mocked(prisma.channel.findFirst).mockResolvedValue({
        id: 'ch-1',
        config: { appSecret: 'secret' }
      } as any)
      vi.mocked(messengerService.verifyMessengerSignature).mockReturnValue(false)

      await messengerWebhook(req, res)

      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid signature' })
    })

    it('should return 404 when channel is not found', async () => {
      req = {
        params: { workspaceId: 'ws-1' },
        headers: { 'x-hub-signature-256': 'sha256=valid-sig' },
        body: { object: 'page', entry: [] }
      }
      vi.mocked(prisma.channel.findFirst).mockResolvedValue(null)

      await messengerWebhook(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
      expect(res.json).toHaveBeenCalledWith({ error: 'Channel not found' })
    })
  })
})
