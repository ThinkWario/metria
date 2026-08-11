import { prisma } from '../../lib/prisma'
import { getAccessToken } from './google-calendar.service'

/**
 * Sends an email via the Gmail API, authenticated as the workspace's
 * connected Google account (the same OAuth grant used for Calendar sync).
 * Throws on any failure — no Google connection, token refresh failure, or
 * a Gmail API error. Callers that must not fail on a notification error
 * (e.g. appointment-notifications.service.ts) are responsible for catching.
 */
export async function sendGmailEmail(
  workspaceId: string,
  params: { to: string[]; subject: string; html: string }
): Promise<void> {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { googleCalEmail: true }
  })
  if (!ws?.googleCalEmail) throw new Error('google_calendar_not_connected')

  const accessToken = await getAccessToken(workspaceId)
  const { to, subject, html } = params

  // RFC 2047 encoded-word so a subject containing emoji/non-ASCII survives as a mail header.
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`

  const message = [
    `From: ${ws.googleCalEmail}`,
    `To: ${to.join(', ')}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    html
  ].join('\r\n')

  const raw = Buffer.from(message, 'utf-8').toString('base64url')

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ raw })
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`[gmail] send failed: ${err}`)
  }
}
