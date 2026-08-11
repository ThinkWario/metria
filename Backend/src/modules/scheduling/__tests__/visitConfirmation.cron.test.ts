import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    appointment: { findMany: vi.fn(), update: vi.fn() },
    workspace: { findUnique: vi.fn() },
    channel: { findFirst: vi.fn() }
  }
}))
vi.mock('../../messaging/message.service', () => ({
  sendWhatsAppTemplateToPhone: vi.fn(async () => {})
}))

import { requestPendingConfirmations } from '../visitConfirmation.cron'
import { prisma } from '../../../lib/prisma'
import { sendWhatsAppTemplateToPhone } from '../../messaging/message.service'

beforeEach(() => vi.clearAllMocks())

describe('requestPendingConfirmations', () => {
  it('manda el template con los dos payloads de botón y marca confirmationRequestedAt', async () => {
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([
      { id: 'a1', workspaceId: 'ws-1', contact: { name: 'Roberto', phone: '56911112222' } }
    ] as any)
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ notifyPhone: '56900001111' } as any)
    vi.mocked(prisma.channel.findFirst).mockResolvedValue({
      id: 'ch-1', config: { visitConfirmationTemplateId: 'tpl-1' }
    } as any)

    await requestPendingConfirmations()

    expect(sendWhatsAppTemplateToPhone).toHaveBeenCalledWith(
      'ch-1', '56900001111', 'tpl-1', ['Roberto'],
      ['confirm_visit:a1:yes', 'confirm_visit:a1:no']
    )
    expect(prisma.appointment.update).toHaveBeenCalledWith({
      where: { id: 'a1' }, data: { confirmationRequestedAt: expect.any(Date) }
    })
  })

  it('no manda nada ni marca la cita si falta notifyPhone, canal o plantilla configurada', async () => {
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([
      { id: 'a2', workspaceId: 'ws-1', contact: { name: 'Ana', phone: '56922223333' } }
    ] as any)
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ notifyPhone: null } as any)
    vi.mocked(prisma.channel.findFirst).mockResolvedValue({ id: 'ch-1', config: {} } as any)

    await requestPendingConfirmations()

    expect(sendWhatsAppTemplateToPhone).not.toHaveBeenCalled()
    expect(prisma.appointment.update).not.toHaveBeenCalled()
  })

  it('manda el template a cada número cuando notifyPhone tiene varios separados por coma', async () => {
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([
      { id: 'a3', workspaceId: 'ws-1', contact: { name: 'Roberto', phone: '56911112222' } }
    ] as any)
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({ notifyPhone: '56900001111,56922223333' } as any)
    vi.mocked(prisma.channel.findFirst).mockResolvedValue({
      id: 'ch-1', config: { visitConfirmationTemplateId: 'tpl-1' }
    } as any)

    await requestPendingConfirmations()

    expect(sendWhatsAppTemplateToPhone).toHaveBeenCalledWith(
      'ch-1', '56900001111', 'tpl-1', ['Roberto'],
      ['confirm_visit:a3:yes', 'confirm_visit:a3:no']
    )
    expect(sendWhatsAppTemplateToPhone).toHaveBeenCalledWith(
      'ch-1', '56922223333', 'tpl-1', ['Roberto'],
      ['confirm_visit:a3:yes', 'confirm_visit:a3:no']
    )
  })
})
