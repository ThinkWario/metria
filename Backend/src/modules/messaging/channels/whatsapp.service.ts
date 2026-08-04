/**
 * WhatsApp Cloud API — outbound message dispatch + inbound webhook verification and parsing.
 */

import crypto from 'crypto'
import { processInboundMessage } from '../message.service'
import { prisma } from '../../../lib/prisma'

const WA_API_VERSION = 'v26.0'

export interface WhatsAppBody {
  entry?: Array<{
    changes?: Array<{
      value?: {
        contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>
        messages?: Array<{
          id: string
          from: string
          type: string
          text?: { body: string }
          image?: { id: string; mime_type: string }
          video?: { id: string; mime_type: string }
          audio?: { id: string; mime_type: string }
          interactive?: { button_reply?: { id: string; title: string } }
          referral?: { ref: string }
        }>
        statuses?: unknown[]
      }
    }>
  }>
}

export async function sendWhatsAppMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  text: string
): Promise<void> {
  const url = `https://graph.facebook.com/${WA_API_VERSION}/${phoneNumberId}/messages`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text }
    })
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`WhatsApp API error ${response.status}: ${body}`)
  }
}

/**
 * Sends an approved template (HSM) message — the only send type Meta allows
 * to a contact that has never messaged the business number, since free-form
 * text outside the 24h customer service window is rejected (error 131047).
 */
export async function sendWhatsAppTemplateMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  templateName: string,
  language: string,
  bodyParams: string[] = [],
  buttonPayloads?: string[]
): Promise<void> {
  const url = `https://graph.facebook.com/${WA_API_VERSION}/${phoneNumberId}/messages`

  const components: Record<string, unknown>[] = []
  if (bodyParams.length > 0) {
    components.push({ type: 'body', parameters: bodyParams.map(text => ({ type: 'text', text })) })
  }
  buttonPayloads?.forEach((payload, index) => {
    components.push({ type: 'button', sub_type: 'quick_reply', index: String(index), parameters: [{ type: 'payload', payload }] })
  })

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: language },
        ...(components.length > 0 ? { components } : {})
      }
    })
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`WhatsApp template API error ${response.status}: ${body}`)
  }
}

/**
 * Downloads inbound media from Meta Cloud API. Two-step flow: resolve the
 * media_id to a temporary URL, then fetch it — both requests need the same
 * bearer token.
 */
export async function downloadWhatsAppMedia(
  mediaId: string,
  accessToken: string
): Promise<{ data: string; mimeType: string } | null> {
  try {
    const infoResp = await fetch(`https://graph.facebook.com/${WA_API_VERSION}/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    if (!infoResp.ok) throw new Error(`Media info fetch failed: ${infoResp.status}`)
    const info = await infoResp.json() as { url?: string; mime_type?: string }
    if (!info.url) return null

    const fileResp = await fetch(info.url, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!fileResp.ok) throw new Error(`Media download failed: ${fileResp.status}`)
    const buffer = Buffer.from(await fileResp.arrayBuffer())
    return { data: buffer.toString('base64'), mimeType: info.mime_type || 'audio/ogg' }
  } catch (err) {
    console.error(`[WhatsApp] Failed to download media ${mediaId}:`, err)
    return null
  }
}

/** Best-effort read receipt — never interrupt the inbound flow over its failure. */
export async function markWhatsAppMessageRead(
  phoneNumberId: string,
  accessToken: string,
  messageId: string
): Promise<void> {
  try {
    await fetch(`https://graph.facebook.com/${WA_API_VERSION}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: messageId })
    })
  } catch {
    // Non-critical — a failed read receipt must never block message processing.
  }
}

/**
 * Verify WhatsApp webhook signature using HMAC-SHA256.
 * Returns false if verification fails or signature format is invalid.
 */
export function verifyWhatsAppSignature(
  rawBody: string | Buffer,
  signatureHeader: string,
  appSecret: string
): boolean {
  try {
    // Check if signature header is present and starts with sha256=
    if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
      return false
    }

    // Compute expected signature
    const expectedSignature =
      'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')

    // Use timing-safe comparison to prevent timing attacks
    const expectedBuffer = Buffer.from(expectedSignature)
    const providedBuffer = Buffer.from(signatureHeader)

    return crypto.timingSafeEqual(expectedBuffer, providedBuffer)
  } catch {
    // If buffers have different lengths or any error occurs, return false
    return false
  }
}

/**
 * Normaliza una respuesta de texto libre a sí/no para la confirmación de
 * visita técnica sin botones — quita tildes, espacios y puntuación final
 * antes de comparar. Devuelve null si no matchea ninguno (el mensaje cae
 * al procesamiento normal en vez de perderse en silencio).
 */
export function parseVisitConfirmationAnswer(text: string): 'yes' | 'no' | null {
  const normalized = text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[.,!¡¿?]+$/g, '')
    .trim()
  if (normalized === 'si') return 'yes'
  if (normalized === 'no') return 'no'
  return null
}

/**
 * Parse inbound WhatsApp webhook and process text messages.
 * Skips non-text messages and status updates silently.
 */
export async function parseWhatsAppUpdate(
  workspaceId: string,
  channelId: string,
  body: WhatsAppBody,
  credentials?: { accessToken: string; phoneNumberId: string }
): Promise<void> {
  if (!body.entry) return

  for (const entry of body.entry) {
    if (!entry.changes) continue

    for (const change of entry.changes) {
      const value = change.value
      if (!value || !value.messages || value.messages.length === 0) {
        continue
      }

      // Build contact map: wa_id → name
      const contactMap = new Map<string, string | undefined>()
      if (value.contacts) {
        for (const contact of value.contacts) {
          if (contact.wa_id) {
            contactMap.set(contact.wa_id, contact.profile?.name)
          }
        }
      }

      for (const msg of value.messages) {
        if (msg.type === 'text' && msg.text?.body) {
          try {
            // Confirmación de visita técnica por texto libre (sí/no) desde
            // notifyPhone — mismo criterio de origen que la rama de botones
            // de abajo, pero sin depender de que la plantilla tenga quick-reply
            // buttons aprobados por Meta. Si el remitente no es notifyPhone, si
            // el texto no matchea sí/no, o si no hay ninguna cita esperando
            // confirmación, cae al procesamiento normal de mensaje — nunca se
            // pierde en silencio.
            const workspaceForConfirmation = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { notifyPhone: true } })
            const notifyDigitsForConfirmation = (workspaceForConfirmation?.notifyPhone ?? '').replace(/\D/g, '')
            if (notifyDigitsForConfirmation && msg.from === notifyDigitsForConfirmation) {
              const answer = parseVisitConfirmationAnswer(msg.text.body)
              if (answer) {
                const pendingAppointment = await prisma.appointment.findFirst({
                  where: {
                    workspaceId,
                    type: 'SITE_VISIT',
                    status: { in: ['SCHEDULED', 'CONFIRMED'] },
                    confirmationRequestedAt: { not: null }
                  },
                  orderBy: { confirmationRequestedAt: 'desc' }
                })
                if (pendingAppointment) {
                  const { updateAppointmentStatus } = await import('../../scheduling/scheduling.service')
                  await updateAppointmentStatus(workspaceId, pendingAppointment.id, answer === 'yes' ? 'COMPLETED' : 'NO_SHOW')
                  continue
                }
              }
            }

            // Check for referral/ref data in payload (if available)
            const metadata = msg.referral ? { campaign_id: msg.referral.ref } : {}

            await processInboundMessage({
              workspaceId,
              channelId,
              externalConversationId: msg.from,
              externalMessageId: msg.id,
              senderExternalId: msg.from,
              senderName: contactMap.get(msg.from),
              content: msg.text.body,
              mediaUrl: undefined,
              mediaType: undefined,
              metadata
            })
          } catch (err) {
            console.error(`[WhatsApp] Failed to process message ${msg.id}:`, err)
          }
        } else if (msg.type === 'interactive' && msg.interactive?.button_reply?.id) {
          try {
            const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { notifyPhone: true } })
            const notifyDigits = (workspace?.notifyPhone ?? '').replace(/\D/g, '')
            // Solo el número interno configurado como notifyPhone puede confirmar
            // visitas — cualquier otro botón entrante se ignora en silencio, no se
            // trata como mensaje de un lead (evita crear/tocar un Contact acá).
            if (!notifyDigits || msg.from !== notifyDigits) continue

            const match = msg.interactive.button_reply.id.match(/^confirm_visit:([^:]+):(yes|no)$/)
            if (!match) continue

            const [, appointmentId, answer] = match
            const { updateAppointmentStatus } = await import('../../scheduling/scheduling.service')
            await updateAppointmentStatus(workspaceId, appointmentId, answer === 'yes' ? 'COMPLETED' : 'NO_SHOW')
          } catch (err) {
            console.error(`[WhatsApp] Failed to process visit confirmation reply ${msg.id}:`, err)
          }
        } else if (msg.type === 'audio' && msg.audio?.id) {
          try {
            if (!credentials) {
              console.warn(`[WhatsApp] Audio message ${msg.id} received but no credentials configured — skipped`)
              continue
            }

            markWhatsAppMessageRead(credentials.phoneNumberId, credentials.accessToken, msg.id).catch(() => {})

            const media = await downloadWhatsAppMedia(msg.audio.id, credentials.accessToken)
            if (!media) continue

            const { transcribeAudio } = await import('../../ai-agent/providers/gemini.provider')
            const transcript = await transcribeAudio(media.data, media.mimeType)
            if (!transcript) continue

            const metadata = msg.referral ? { campaign_id: msg.referral.ref } : {}
            await processInboundMessage({
              workspaceId,
              channelId,
              externalConversationId: msg.from,
              externalMessageId: msg.id,
              senderExternalId: msg.from,
              senderName: contactMap.get(msg.from),
              content: transcript,
              mediaType: 'audio',
              metadata
            })
          } catch (err) {
            console.error(`[WhatsApp] Failed to process audio message ${msg.id}:`, err)
          }
        }
      }
    }
  }
}
