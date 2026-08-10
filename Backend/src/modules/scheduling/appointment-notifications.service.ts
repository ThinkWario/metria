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

export function formatApptDateTime(d: Date, tz: string): string {
  const datePart = new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'long', timeZone: tz }).format(d)
  const timePart = new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(d)
  return `${datePart} a las ${timePart}`
}

/**
 * Sends the internal WhatsApp alert (to the workspace's notifyPhone) for a
 * created/rescheduled appointment. Unlike notifyAppointmentEvent, this
 * THROWS on failure — the automatic post-booking flow wraps it and swallows
 * the error (a notification failure must never fail the booking itself),
 * but the manual "reenviar aviso" retry endpoint needs the real error to
 * surface to the user instead of silently pretending it worked.
 */
export async function sendTechnicianAlert(
  workspaceId: string,
  channel: { id: string; config: unknown },
  params: {
    contact: { name: string; phone: string | null }
    appointment: { type: string; scheduledAt: Date }
    kind: AppointmentEventKind
    oldScheduledAt?: Date
  }
): Promise<void> {
  const { contact, appointment, kind, oldScheduledAt } = params

  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { notifyPhone: true } })
  if (!ws?.notifyPhone) throw new Error('notify_phone_not_configured')

  const tz = await getWorkspaceTimezone(workspaceId)
  const when = formatApptDateTime(appointment.scheduledAt, tz)
  const type = typeLabel(appointment.type)

  // The encargado's own phone rarely has an open 24h window with the business
  // number — a plain-text alert gets silently rejected by Meta (error 131047)
  // unless a template is configured for this specific case.
  const config = channel.config as Record<string, any>
  const technicalVisitTemplateId = appointment.type === 'SITE_VISIT' ? config?.technicalVisitTemplateId : undefined

  if (technicalVisitTemplateId) {
    const { sendInternalWhatsAppTemplate } = await import('../messaging/message.service')
    await sendInternalWhatsAppTemplate(
      workspaceId, channel.id, ws.notifyPhone, technicalVisitTemplateId,
      [contact.name, contact.phone ?? 'sin teléfono', when]
    )
  } else {
    const internalText = kind === 'created'
      ? `Nueva cita — ${contact.name} (${contact.phone ?? 'sin teléfono'}), ${type}, ${when}.`
      : `Cita reagendada — ${contact.name} (${contact.phone ?? 'sin teléfono'}), ${type}: de ${formatApptDateTime(oldScheduledAt!, tz)} a ${when}.`
    await sendPlatformMessage('WHATSAPP', channel.config, ws.notifyPhone, internalText, workspaceId)
  }
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

    const channel = await prisma.channel.findFirst({ where: { workspaceId, platform: 'WHATSAPP', status: 'CONNECTED' } })
    if (!channel) return

    try {
      await sendTechnicianAlert(workspaceId, channel, { contact, appointment, kind, oldScheduledAt })
    } catch (err) {
      console.error('[appointment-notifications] internal alert failed (non-blocking):', err)
    }

    const tz = await getWorkspaceTimezone(workspaceId)
    const when = formatApptDateTime(appointment.scheduledAt, tz)
    const type = typeLabel(appointment.type)

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
