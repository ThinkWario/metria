import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setOpeningTemplateHandler, setTemplateRoleHandler } from '../templates.controller'
import { prisma } from '../../../lib/prisma'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    channel: { findFirst: vi.fn(), update: vi.fn() },
    whatsAppTemplate: { findFirst: vi.fn() }
  }
}))

function buildReq(params: any, body: any = {}) {
  return { user: { workspaceId: 'ws-1' }, params, body } as any
}

function buildRes() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any
}

const CONNECTED_CHANNEL = { id: 'ch-1', config: {} }

describe('template role assignment — variable compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.channel.findFirst).mockResolvedValue(CONNECTED_CHANNEL as any)
    vi.mocked(prisma.channel.update).mockResolvedValue({ config: {} } as any)
  })

  it('rejects setOpeningTemplateHandler when template.variables does not match [contact.name]', async () => {
    vi.mocked(prisma.whatsAppTemplate.findFirst).mockResolvedValue({
      id: 'tpl-1', status: 'APPROVED', variables: ['contact.name', 'contact.phone']
    } as any)
    const req = buildReq({ id: 'tpl-1' })
    const res = buildRes()

    await setOpeningTemplateHandler(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(prisma.channel.update).not.toHaveBeenCalled()
  })

  it('allows setOpeningTemplateHandler when template.variables is exactly [contact.name]', async () => {
    vi.mocked(prisma.whatsAppTemplate.findFirst).mockResolvedValue({
      id: 'tpl-1', status: 'APPROVED', variables: ['contact.name']
    } as any)
    const req = buildReq({ id: 'tpl-1' })
    const res = buildRes()

    await setOpeningTemplateHandler(req, res)

    expect(res.status).not.toHaveBeenCalledWith(400)
    expect(prisma.channel.update).toHaveBeenCalled()
  })

  it('allows setOpeningTemplateHandler when template.variables is null (legacy template)', async () => {
    vi.mocked(prisma.whatsAppTemplate.findFirst).mockResolvedValue({
      id: 'tpl-1', status: 'APPROVED', variables: null
    } as any)
    const req = buildReq({ id: 'tpl-1' })
    const res = buildRes()

    await setOpeningTemplateHandler(req, res)

    expect(res.status).not.toHaveBeenCalledWith(400)
    expect(prisma.channel.update).toHaveBeenCalled()
  })

  it('rejects setTemplateRoleHandler for technicalVisitTemplateId when variable order is wrong', async () => {
    vi.mocked(prisma.whatsAppTemplate.findFirst).mockResolvedValue({
      id: 'tpl-2', status: 'APPROVED', variables: ['contact.phone', 'contact.name', 'appointment.when']
    } as any)
    const req = buildReq({ role: 'technicalVisitTemplateId' }, { templateId: 'tpl-2' })
    const res = buildRes()

    await setTemplateRoleHandler(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(prisma.channel.update).not.toHaveBeenCalled()
  })

  it('allows setTemplateRoleHandler for technicalVisitTemplateId when variables match exactly', async () => {
    vi.mocked(prisma.whatsAppTemplate.findFirst).mockResolvedValue({
      id: 'tpl-2', status: 'APPROVED', variables: ['contact.name', 'contact.phone', 'appointment.when']
    } as any)
    const req = buildReq({ role: 'technicalVisitTemplateId' }, { templateId: 'tpl-2' })
    const res = buildRes()

    await setTemplateRoleHandler(req, res)

    expect(res.status).not.toHaveBeenCalledWith(400)
    expect(prisma.channel.update).toHaveBeenCalled()
  })
})
