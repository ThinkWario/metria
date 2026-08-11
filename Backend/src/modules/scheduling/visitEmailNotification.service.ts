import { prisma } from '../../lib/prisma'
import { sendGmailEmail } from './gmail.service'
import { formatApptDateTime } from './appointment-notifications.service'

async function getWorkspaceTimezone(workspaceId: string): Promise<string> {
  try {
    const bh = await prisma.businessHours.findUnique({ where: { workspaceId }, select: { timezone: true } })
    return bh?.timezone || 'America/Santiago'
  } catch {
    return 'America/Santiago'
  }
}

function row(label: string, value?: string | null): string {
  if (!value) return ''
  return `<tr><td style="padding:2px 12px 2px 0;color:#666;white-space:nowrap;">${label}</td><td style="padding:2px 0;font-weight:600;">${value}</td></tr>`
}

function mapLink(url?: string, label?: string): string {
  if (!url) return ''
  return `<div style="margin-top:4px;"><a href="${url}" style="color:#7c3aed;text-decoration:none;">→ ${label}</a></div>`
}

function buildVisitEmailHtml(data: {
  name: string
  phone: string | null
  when: string
  oldWhen?: string
  direccion?: string
  houseMapUrl?: string
  meterMapUrl?: string
  quoteUrl?: string
}): string {
  const quoteSection = data.quoteUrl
    ? `<h3 style="margin:20px 0 6px;">💰 Cotización</h3>${mapLink(data.quoteUrl, 'Ver cotización')}`
    : ''

  return `
<div style="font-family:Arial,sans-serif;font-size:14px;color:#111;line-height:1.5;max-width:520px;">
  <p>Equipo DrillChile,</p>
  <p>Se agendó una nueva visita técnica. Detalle para coordinar la salida:</p>

  <h3 style="margin:20px 0 6px;">🗓️ Visita</h3>
  <table>
    ${row('Fecha y hora:', data.when)}
    ${data.oldWhen ? row('Anteriormente:', data.oldWhen) : ''}
  </table>

  <h3 style="margin:20px 0 6px;">👤 Cliente</h3>
  <table>
    ${row('Nombre:', data.name)}
    ${row('Teléfono:', data.phone)}
  </table>

  <h3 style="margin:20px 0 6px;">📍 Ubicación</h3>
  <table>
    ${row('Dirección:', data.direccion)}
  </table>
  ${mapLink(data.houseMapUrl, 'Ver ubicación de la casa')}
  ${mapLink(data.meterMapUrl, 'Ver ubicación del medidor')}

  ${quoteSection}

  <p style="margin-top:24px;">Revisa el CRM para más detalles.</p>
  <p style="color:#999;font-size:12px;margin-top:24px;">— Metria · Aviso automático</p>
</div>
  `.trim()
}

/**
 * Sends the SITE_VISIT email notification to the workspace's configured
 * visitNotifyEmails recipients. No-ops (does not throw) for non-SITE_VISIT
 * appointments or when no recipients are configured — same on/off
 * philosophy as the WhatsApp technician alert's notifyPhone gate. Throws
 * on a real Gmail send failure; the caller (appointment-notifications
 * .service.ts) is responsible for treating that as non-blocking.
 */
export async function sendVisitEmailNotification(
  workspaceId: string,
  params: {
    contact: { id: string; name: string; phone: string | null }
    appointment: { type: string; scheduledAt: Date }
    kind: 'created' | 'rescheduled'
    oldScheduledAt?: Date
  }
): Promise<void> {
  const { contact, appointment, kind, oldScheduledAt } = params
  if (appointment.type !== 'SITE_VISIT') return

  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { visitNotifyEmails: true } })
  const recipients = (ws?.visitNotifyEmails ?? '').split(',').map(e => e.trim()).filter(Boolean)
  if (recipients.length === 0) return

  const full = await prisma.contact.findUnique({
    where: { id: contact.id },
    select: { qualificationData: true, sessionId: true }
  })
  const rawFields = ((full?.qualificationData as any)?.rawFields ?? {}) as Record<string, string>
  const quoteUrl = full?.sessionId ? `https://solar.drillchile.cl/cotizaciones?sessionId=${full.sessionId}` : undefined

  const tz = await getWorkspaceTimezone(workspaceId)
  const when = formatApptDateTime(appointment.scheduledAt, tz)
  const oldWhen = oldScheduledAt ? formatApptDateTime(oldScheduledAt, tz) : undefined

  const subject = kind === 'created'
    ? `📅 Nueva visita técnica agendada — ${contact.name}`
    : `📅 Visita técnica reagendada — ${contact.name}`

  const html = buildVisitEmailHtml({
    name: contact.name,
    phone: contact.phone,
    when,
    oldWhen,
    direccion: rawFields.direccion,
    houseMapUrl: rawFields.houseMapUrl,
    meterMapUrl: rawFields.meterMapUrl,
    quoteUrl
  })

  await sendGmailEmail(workspaceId, { to: recipients, subject, html })
}
