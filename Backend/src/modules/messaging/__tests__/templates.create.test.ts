import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTemplateHandler } from '../templates.controller'
import { prisma } from '../../../lib/prisma'
import { createMetaTemplate } from '../channels/whatsappTemplates.client'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    channel: { findFirst: vi.fn(), update: vi.fn() },
    whatsAppTemplate: { findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn() }
  }
}))

vi.mock('../channels/whatsappTemplates.client', () => ({
  createMetaTemplate: vi.fn(),
  listMetaTemplates: vi.fn(),
  deleteMetaTemplate: vi.fn()
}))

function buildReq(body: any) {
  return { user: { workspaceId: 'ws-1' }, body } as any
}

function buildRes() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any
}

const CONNECTED_CHANNEL = { id: 'ch-1', config: { wabaId: 'waba-1', accessToken: 'token-1' } }

describe('createTemplateHandler — variable validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.channel.findFirst).mockResolvedValue(CONNECTED_CHANNEL as any)
  })

  it('returns 400 when variables.length does not match the {{n}} count in bodyText', async () => {
    const req = buildReq({ name: 'saludo', bodyText: 'Hola {{1}} y {{2}}', variables: ['contact.name'] })
    const res = buildRes()

    await createTemplateHandler(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(createMetaTemplate).not.toHaveBeenCalled()
  })

  it('returns 400 when a variable key is not in the catalog', async () => {
    const req = buildReq({ name: 'saludo', bodyText: 'Hola {{1}}', variables: ['not.a.real.key'] })
    const res = buildRes()

    await createTemplateHandler(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(createMetaTemplate).not.toHaveBeenCalled()
  })

  it('forwards variables to createMetaTemplate and persists them when everything matches', async () => {
    vi.mocked(createMetaTemplate).mockResolvedValue({ metaTemplateId: 'meta-1', status: 'PENDING' })
    vi.mocked(prisma.whatsAppTemplate.create).mockResolvedValue({ id: 'tpl-1' } as any)
    const req = buildReq({ name: 'saludo', bodyText: 'Hola {{1}}', variables: ['contact.name'] })
    const res = buildRes()

    await createTemplateHandler(req, res)

    expect(createMetaTemplate).toHaveBeenCalledWith('waba-1', 'token-1', expect.objectContaining({
      variables: ['contact.name']
    }))
    expect(prisma.whatsAppTemplate.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ variables: ['contact.name'] })
    }))
    expect(res.status).toHaveBeenCalledWith(201)
  })

  it('creates the template without variables when the body has no placeholders (legacy path)', async () => {
    vi.mocked(createMetaTemplate).mockResolvedValue({ metaTemplateId: 'meta-2', status: 'PENDING' })
    vi.mocked(prisma.whatsAppTemplate.create).mockResolvedValue({ id: 'tpl-2' } as any)
    const req = buildReq({ name: 'saludo_fijo', bodyText: 'Hola, gracias por tu interés' })
    const res = buildRes()

    await createTemplateHandler(req, res)

    expect(res.status).toHaveBeenCalledWith(201)
  })
})
