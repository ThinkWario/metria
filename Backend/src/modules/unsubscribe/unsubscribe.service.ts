import crypto from 'crypto'
import { prisma } from '../../lib/prisma'

// ── Token helpers ─────────────────────────────────────────────────────────────

/**
 * Generate an HMAC-SHA256 unsubscribe token for a CampaignRecipient.
 * Format (base64url): `<recipientId>:<hmac-hex>`
 */
export function generateUnsubscribeToken(recipientId: string): string {
  const hmac = crypto.createHmac('sha256', process.env.JWT_SECRET!)
  hmac.update(recipientId)
  const sig = hmac.digest('hex')
  return Buffer.from(`${recipientId}:${sig}`).toString('base64url')
}

/**
 * Verify and decode an unsubscribe token. Returns the recipientId on success,
 * throws on invalid/tampered token.
 */
function verifyUnsubscribeToken(token: string): string {
  const decoded = Buffer.from(token, 'base64url').toString('utf-8')
  const colonIdx = decoded.lastIndexOf(':')
  if (colonIdx < 0) throw new Error('Invalid token format')

  const recipientId = decoded.slice(0, colonIdx)
  const sig = decoded.slice(colonIdx + 1)

  const expected = crypto
    .createHmac('sha256', process.env.JWT_SECRET!)
    .update(recipientId)
    .digest('hex')

  // Constant-time comparison to prevent timing attacks.
  // timingSafeEqual throws if buffers differ in length, so guard first.
  const sigBuf = Buffer.from(sig, 'hex')
  const expectedBuf = Buffer.from(expected, 'hex')
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    throw new Error('Invalid token signature')
  }

  return recipientId
}

// ── Main flow ─────────────────────────────────────────────────────────────────

/**
 * Process an unsubscribe request.
 * - Verifies the HMAC token
 * - Marks the CampaignRecipient as UNSUBSCRIBED (idempotent)
 * - Upserts a Suppression record so future campaigns skip this address
 */
export async function processUnsubscribe(token: string): Promise<void> {
  const recipientId = verifyUnsubscribeToken(token)

  const recipient = await prisma.campaignRecipient.findUniqueOrThrow({
    where: { id: recipientId },
    include: {
      contact: { select: { email: true } },
    },
  })

  // Mark recipient as unsubscribed (idempotent)
  await prisma.campaignRecipient.update({
    where: { id: recipientId },
    data: { status: 'UNSUBSCRIBED' },
  })

  const email = recipient.contact?.email
  // Always use the recipient's own workspaceId as the authoritative tenant to
  // avoid writing a Suppression into the wrong workspace if contact data drifts.
  const workspaceId = recipient.workspaceId

  if (email) {
    await prisma.suppression.upsert({
      where: {
        workspaceId_channel_value: {
          workspaceId,
          channel: 'EMAIL',
          value: email,
        },
      },
      create: {
        workspaceId,
        channel: 'EMAIL',
        value: email,
        reason: 'UNSUBSCRIBE',
      },
      update: {},
    })
  }
}

// ── HTML response ─────────────────────────────────────────────────────────────

export function renderUnsubscribePage(success: boolean, errorMessage?: string): string {
  if (success) {
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Desuscripción exitosa</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f9fafb; color: #111827; }
    .card { background: #fff; border-radius: 12px; padding: 40px 48px; max-width: 420px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 22px; font-weight: 600; margin: 0 0 8px; }
    p { color: #6b7280; font-size: 15px; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✅</div>
    <h1>Te has desuscrito</h1>
    <p>Tu dirección ha sido eliminada de nuestra lista de correos. No recibirás más mensajes de marketing.</p>
  </div>
</body>
</html>`
  }

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Enlace inválido</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f9fafb; color: #111827; }
    .card { background: #fff; border-radius: 12px; padding: 40px 48px; max-width: 420px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 22px; font-weight: 600; margin: 0 0 8px; }
    p { color: #6b7280; font-size: 15px; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">⚠️</div>
    <h1>Enlace inválido</h1>
    <p>${errorMessage ?? 'El enlace de desuscripción no es válido o ya expiró.'}</p>
  </div>
</body>
</html>`
}
