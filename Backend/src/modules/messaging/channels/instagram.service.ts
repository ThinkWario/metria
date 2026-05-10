/**
 * Instagram Messaging API — outbound message dispatch.
 * contact.phone stores platform-specific IDs (ig_<userId> for Instagram).
 */

const GRAPH_API_VERSION = 'v19.0'

export async function sendInstagramMessage(
  pageAccessToken: string,
  recipientId: string,
  text: string
): Promise<void> {
  // Strip optional ig_ prefix so both raw IDs and prefixed IDs work
  const normalizedId = recipientId.startsWith('ig_') ? recipientId.slice(3) : recipientId

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/me/messages`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pageAccessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      recipient: { id: normalizedId },
      message: { text }
    })
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Instagram API error ${response.status}: ${body}`)
  }
}
