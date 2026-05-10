import { prisma } from '../../lib/prisma'

const SLA_HOURS: Record<string, number> = {
  URGENT: 1,
  HIGH: 4,
  MEDIUM: 24,
  LOW: 72
}

export interface ListTicketsOpts {
  status?: string
  priority?: string
  contactId?: string
  limit?: number
  cursor?: string
}

export async function listTickets(workspaceId: string, opts: ListTicketsOpts = {}) {
  const { status, priority, contactId, limit = 50, cursor } = opts
  return prisma.ticket.findMany({
    where: {
      workspaceId,
      ...(status && { status }),
      ...(priority && { priority }),
      ...(contactId && { contactId }),
      ...(cursor && { createdAt: { lt: new Date(cursor) } })
    },
    include: {
      contact: { select: { id: true, name: true, phone: true } }
    },
    orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
    take: limit
  })
}

export interface CreateTicketData {
  contactId: string
  title: string
  description?: string
  priority?: string
  orderId?: string
  conversationId?: string
  assignedToUserId?: string
}

export async function createTicket(workspaceId: string, data: CreateTicketData) {
  const contact = await prisma.contact.findFirst({ where: { id: data.contactId, workspaceId } })
  if (!contact) throw new Error('Contact not found')

  const priority = data.priority ?? 'MEDIUM'
  const slaHours = SLA_HOURS[priority] ?? 24
  const slaDeadline = new Date(Date.now() + slaHours * 60 * 60 * 1000)

  return prisma.ticket.create({
    data: {
      workspaceId,
      contactId: data.contactId,
      title: data.title,
      priority,
      slaDeadline,
      ...(data.description && { description: data.description }),
      ...(data.orderId && { orderId: data.orderId }),
      ...(data.conversationId && { conversationId: data.conversationId }),
      ...(data.assignedToUserId && { assignedToUserId: data.assignedToUserId })
    },
    include: { contact: { select: { id: true, name: true, phone: true } } }
  })
}

export async function updateTicket(
  workspaceId: string,
  ticketId: string,
  data: { status?: string; priority?: string; assignedToUserId?: string | null }
) {
  const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, workspaceId } })
  if (!ticket) throw new Error('Ticket not found')

  const updateData: Record<string, unknown> = {}
  if (data.status !== undefined) updateData.status = data.status
  if (data.priority !== undefined) updateData.priority = data.priority
  if ('assignedToUserId' in data) updateData.assignedToUserId = data.assignedToUserId

  return prisma.ticket.update({ where: { id: ticketId, workspaceId }, data: updateData })
}

export async function resolveTicket(workspaceId: string, ticketId: string) {
  const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, workspaceId } })
  if (!ticket) throw new Error('Ticket not found')
  return prisma.ticket.update({
    where: { id: ticketId, workspaceId },
    data: { status: 'RESOLVED', resolvedAt: new Date() }
  })
}
