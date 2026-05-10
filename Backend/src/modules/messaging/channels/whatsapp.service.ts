/**
 * WhatsApp Cloud API — outbound message dispatch.
 * Inbound webhook handling lives in the WhatsApp webhook route.
 */

const WA_API_VERSION = 'v19.0'

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
