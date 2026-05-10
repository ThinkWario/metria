import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    ticket: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    contact: { findFirst: vi.fn() }
  }
}))

import { listTickets, createTicket, updateTicket, resolveTicket } from '../ticket.service'
import { prisma } from '../../../lib/prisma'

const WS = 'ws-1'

beforeEach(() => vi.clearAllMocks())

describe('listTickets', () => {
  it('returns tickets scoped to workspaceId', async () => {
    vi.mocked(prisma.ticket.findMany).mockResolvedValue([])
    await listTickets(WS, {})
    expect(prisma.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ workspaceId: WS }) })
    )
  })

  it('passes status and priority filters', async () => {
    vi.mocked(prisma.ticket.findMany).mockResolvedValue([])
    await listTickets(WS, { status: 'OPEN', priority: 'HIGH' })
    expect(prisma.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'OPEN', priority: 'HIGH' }) })
    )
  })
})

describe('createTicket', () => {
  it('throws if contact not in workspace', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue(null)
    await expect(createTicket(WS, { contactId: 'c1', title: 'Bug' })).rejects.toThrow('Contact not found')
  })

  it('sets SLA deadline from priority', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({ id: 'c1' } as any)
    vi.mocked(prisma.ticket.create).mockResolvedValue({ id: 't1' } as any)
    const before = Date.now()
    await createTicket(WS, { contactId: 'c1', title: 'Urgent bug', priority: 'URGENT' })
    const call = vi.mocked(prisma.ticket.create).mock.calls[0][0]
    const sla = call.data.slaDeadline as Date
    // URGENT = 1 hour = 3600000ms
    expect(sla.getTime() - before).toBeGreaterThan(3500000)
    expect(sla.getTime() - before).toBeLessThan(3700000)
  })

  it('defaults priority to MEDIUM when not provided', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({ id: 'c1' } as any)
    vi.mocked(prisma.ticket.create).mockResolvedValue({ id: 't1' } as any)
    await createTicket(WS, { contactId: 'c1', title: 'Issue' })
    const call = vi.mocked(prisma.ticket.create).mock.calls[0][0]
    expect(call.data.priority).toBe('MEDIUM')
  })
})

describe('updateTicket', () => {
  it('throws if ticket not found', async () => {
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(null)
    await expect(updateTicket(WS, 't1', { status: 'IN_PROGRESS' })).rejects.toThrow('Ticket not found')
  })

  it('updates status when provided', async () => {
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue({ id: 't1' } as any)
    vi.mocked(prisma.ticket.update).mockResolvedValue({} as any)
    await updateTicket(WS, 't1', { status: 'IN_PROGRESS' })
    expect(prisma.ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'IN_PROGRESS' }) })
    )
  })

  it('can null assignedToUserId', async () => {
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue({ id: 't1' } as any)
    vi.mocked(prisma.ticket.update).mockResolvedValue({} as any)
    await updateTicket(WS, 't1', { assignedToUserId: null })
    const call = vi.mocked(prisma.ticket.update).mock.calls[0][0]
    expect(call.data).toHaveProperty('assignedToUserId', null)
  })
})

describe('resolveTicket', () => {
  it('sets status=RESOLVED and resolvedAt', async () => {
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue({ id: 't1' } as any)
    vi.mocked(prisma.ticket.update).mockResolvedValue({} as any)
    await resolveTicket(WS, 't1')
    expect(prisma.ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'RESOLVED', resolvedAt: expect.any(Date) })
      })
    )
  })

  it('throws if ticket not found', async () => {
    vi.mocked(prisma.ticket.findFirst).mockResolvedValue(null)
    await expect(resolveTicket(WS, 't1')).rejects.toThrow('Ticket not found')
  })
})
