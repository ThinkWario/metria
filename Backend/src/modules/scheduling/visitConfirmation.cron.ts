import cron from 'node-cron'
import { prisma } from '../../lib/prisma'
import { sendWhatsAppTemplateToPhone } from '../messaging/message.service'
import { parsePhoneList } from '../../lib/phoneFormat'

// Las visitas duran 30-60 min — 3h después del horario agendado da margen
// suficiente para que ya haya terminado antes de preguntar por ella.
const CONFIRMATION_DELAY_MS = 3 * 60 * 60 * 1000

export async function requestPendingConfirmations(): Promise<void> {
  const cutoff = new Date(Date.now() - CONFIRMATION_DELAY_MS)
  const dueAppointments = await prisma.appointment.findMany({
    where: {
      type: 'SITE_VISIT',
      status: { in: ['SCHEDULED', 'CONFIRMED'] },
      scheduledAt: { lt: cutoff },
      confirmationRequestedAt: null
    },
    include: { contact: { select: { name: true, phone: true } } }
  })

  for (const appt of dueAppointments) {
    try {
      const workspace = await prisma.workspace.findUnique({ where: { id: appt.workspaceId }, select: { notifyPhone: true } })
      const channel = await prisma.channel.findFirst({ where: { workspaceId: appt.workspaceId, platform: 'WHATSAPP', status: 'CONNECTED' } })
      const templateId = (channel?.config as Record<string, any> | undefined)?.visitConfirmationTemplateId
      const phones = parsePhoneList(workspace?.notifyPhone)

      if (phones.length === 0 || !channel || !templateId) {
        console.warn(`[VisitConfirmation] Saltando cita ${appt.id}: notifyPhone/canal/plantilla no configurados`)
        continue
      }

      for (const phone of phones) {
        await sendWhatsAppTemplateToPhone(
          channel.id,
          phone,
          templateId,
          [appt.contact.name],
          [`confirm_visit:${appt.id}:yes`, `confirm_visit:${appt.id}:no`]
        )
      }

      await prisma.appointment.update({ where: { id: appt.id }, data: { confirmationRequestedAt: new Date() } })
    } catch (err) {
      console.error(`[VisitConfirmation] Error pidiendo confirmación para la cita ${appt.id}:`, err)
    }
  }
}

export function startVisitConfirmationCron(): void {
  // Cada hora — la pregunta de confirmación no necesita SLA de minutos.
  cron.schedule('0 * * * *', () => {
    requestPendingConfirmations().catch(err => console.error('[Cron: VisitConfirmation] Error:', err))
  })
  console.log('[VisitConfirmationCron] Scheduled hourly')
}
