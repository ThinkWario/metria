import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Request, Response } from 'express'
import { messengerWebhookVerify, messengerWebhook, sendTemplateHandler } from '../messaging.controller'
import { prisma } from '../../../lib/prisma'
import * as messengerService from '../channels/messenger.service'
import * as messageService from '../message.service'

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

vi.mock('../message.service', () => ({
  sendOutboundWhatsAppTemplate: vi.fn()
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
      expect(messengerService.parseMessengerUpdate).toHaveBeenCalledWith('ws-1', 'ch-1', req.body, { appSecret: 'secret' })
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

  describe('sendTemplateHandler', () => {
    function makeReq(body: any) {
      return {
        params: { conversationId: 'conv-1' },
        body,
        user: { workspaceId: 'ws-1', id: 'user-1' }
      } as any
    }

    it('sends the template and returns the created message', async () => {
      const req = makeReq({ templateId: 'tpl-1' })
      const sentMessage = { id: 'msg-1', content: 'Hola Roberto' }
      vi.mocked(messageService.sendOutboundWhatsAppTemplate).mockResolvedValue(sentMessage as any)

      await sendTemplateHandler(req, res)

      expect(messageService.sendOutboundWhatsAppTemplate).toHaveBeenCalledWith('ws-1', 'conv-1', 'tpl-1')
      expect(res.status).toHaveBeenCalledWith(201)
      expect(res.json).toHaveBeenCalledWith(sentMessage)
    })

    it('returns 400 when templateId is missing', async () => {
      const req = makeReq({})

      await sendTemplateHandler(req, res)

      expect(messageService.sendOutboundWhatsAppTemplate).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({ error: 'templateId is required' })
    })

    it('returns 404 when the conversation is not found', async () => {
      const req = makeReq({ templateId: 'tpl-1' })
      vi.mocked(messageService.sendOutboundWhatsAppTemplate).mockRejectedValue(new Error('Conversation not found'))

      await sendTemplateHandler(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
      expect(res.json).toHaveBeenCalledWith({ error: 'Conversation not found' })
    })

    it('returns 400 when the template is not approved for this channel', async () => {
      const req = makeReq({ templateId: 'tpl-1' })
      vi.mocked(messageService.sendOutboundWhatsAppTemplate).mockRejectedValue(
        new Error('Template tpl-1 not found or not APPROVED for this channel')
      )

      await sendTemplateHandler(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
    })
  })
})
