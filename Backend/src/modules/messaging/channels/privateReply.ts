/**
 * Meta Private Reply API — converts a public comment (Instagram or Facebook
 * Page) into a private message thread. Same endpoint shape for both
 * platforms, so this is shared by instagram.service.ts and messenger.service.ts.
 */

const GRAPH_API_VERSION = 'v19.0'

export async function sendPrivateReply(
  pageAccessToken: string,
  commentId: string,
  text: string
): Promise<void> {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${commentId}/private_replies`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pageAccessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message: text })
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Private reply API error ${response.status}: ${body}`)
  }
}
