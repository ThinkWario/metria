import { prisma } from '../../lib/prisma'
import { sendPlatformMessage, sendOutboundPlatformMessage } from '../messaging/message.service'

type AppointmentEventKind = 'created' | 'rescheduled'

const TYPE_LABELS: Record<string, string> = {
  SITE_VISIT: 'Visita técnica',
  CALL: 'Llamada'
}

function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? 'Cita'
}

async function getWorkspaceTimezone(workspaceId: string): Promise<string> {
  try {
    const bh = await prisma.businessHours.findUnique({ where: { workspaceId }, select: { timezone: true } })
    return bh?.timezone || 'America/Santiago'
  } catch {
    return 'America/Santiago'
  }
}

function formatApptDateTime(d: Date, tz: string): string {
  const datePart = new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'long', timeZone: tz }).format(d)
  const timePart = new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(d)
  return `${datePart} a las ${timePart}`
}

/**
 * Sends the WhatsApp notifications for an appointment being created or rescheduled:
 * a confirmation to the lead, and an alert to the workspace's internal notifyPhone
 * (if configured). No-op if the workspace has no WhatsApp channel connected. Never
 * throws — a notification failure must never fail the booking/reschedule request.
 */
export async function notifyAppointmentEvent(
  workspaceId: string,
  params: {
    contact: { id: string; name: string; phone: string | null }
    appointment: { type: string; scheduledAt: Date; durationMin: number }
    kind: AppointmentEventKind
    oldScheduledAt?: Date
    conversationId?: string
  }
): Promise<void> {
  try {
    const { contact, appointment, kind, oldScheduledAt, conversationId } = params
    if (kind === 'rescheduled' && !oldScheduledAt) {
      console.error('[appointment-notifications] rescheduled event missing oldScheduledAt, skipping')
      return
    }

    const channel = await prisma.channel.findFirst({ where: { workspaceId, platform: 'WHATSAPP' } })
    if (!channel) return

    const tz = await getWorkspaceTimezone(workspaceId)
    const when = formatApptDateTime(appointment.scheduledAt, tz)
    const type = typeLabel(appointment.type)

    try {
      const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { notifyPhone: true } })
      if (ws?.notifyPhone) {
        const internalText = kind === 'created'
          ? `Nueva cita — ${contact.name} (${contact.phone ?? 'sin teléfono'}), ${type}, ${when}.`
          : `Cita reagendada — ${contact.name} (${contact.phone ?? 'sin teléfono'}), ${type}: de ${formatApptDateTime(oldScheduledAt!, tz)} a ${when}.`

        // The encargado's own phone rarely has an open 24h window with the business
        // number — a plain-text alert gets silently rejected by Meta (error 131047)
        // unless a template is configured for this specific case.
        const config = channel.config as Record<string, any>
        const technicalVisitTemplateId = appointment.type === 'SITE_VISIT' ? config?.technicalVisitTemplateId : undefined

        if (technicalVisitTemplateId) {
          const { sendWhatsAppTemplateToPhone } = await import('../messaging/message.service')
          await sendWhatsAppTemplateToPhone(channel.id, ws.notifyPhone, technicalVisitTemplateId, [contact.name, contact.phone ?? 'sin teléfono', when])
        } else {
          await sendPlatformMessage('WHATSAPP', channel.config, ws.notifyPhone, internalText, workspaceId)
        }
      }
    } catch (err) {
      console.error('[appointment-notifications] internal alert failed (non-blocking):', err)
    }

    try {
      const leadText = kind === 'created'
        ? `Tu ${type.toLowerCase()} quedó agendada para el ${when}. Cualquier cambio, escríbenos por aquí.`
        : `Tu ${type.toLowerCase()} fue reagendada: ahora es el ${when} (antes: ${formatApptDateTime(oldScheduledAt!, tz)}).`

      if (conversationId) {
        await sendOutboundPlatformMessage(workspaceId, conversationId, leadText)
      } else if (contact.phone) {
        await sendPlatformMessage('WHATSAPP', channel.config, contact.phone, leadText, workspaceId)
      }
    } catch (err) {
      console.error('[appointment-notifications] lead confirmation failed (non-blocking):', err)
    }
  } catch (err) {
    console.error('[appointment-notifications] notifyAppointmentEvent failed (non-blocking):', err)
  }
}
