# Sprint 3B Design Spec
**Date:** 2026-06-20  
**Sprint:** 3B — Bidireccional Completo + Unsubscribe  
**Author:** Claude Fable 5  

---

## Overview

Sprint 3B makes email and SMS truly bidireccional and adds CAN-SPAM-compliant unsubscribe. All three features plug into the existing `processInboundMessage()` + `emitContactEvent()` pipeline already used by WhatsApp/Instagram/Messenger. No new DB models required beyond adding a `status` enum value to `CampaignRecipient`.

### Features

| # | Feature | Complexity |
|---|---------|-----------|
| 3B-1 | Email inbound (Resend/Postmark webhook) | Medium |
| 3B-2 | SMS inbound (Twilio webhook) | Medium |
| 3B-3 | Unsubscribe link injection + handler | Medium |

---

## Architecture Overview

```
Inbound Email Reply
  → POST /webhooks/email/inbound
  → email.inbound.service.ts
  → findOrCreateContact(sender email)
  → processInboundMessage()        ← reuses existing WhatsApp pipeline
  → emitContactEvent(MESSAGE_RECEIVED)   ← triggers automations

Inbound SMS Reply
  → POST /webhooks/sms/inbound
  → sms.inbound.service.ts
  → validateTwilioSignature()
  → findOrCreateContact(sender phone)
  → processInboundMessage()
  → emitContactEvent(MESSAGE_RECEIVED)

Unsubscribe Click
  → GET /unsubscribe/:token
  → unsubscribe.service.ts
  → verifyHmacToken(token) → recipientId
  → CampaignRecipient.status = UNSUBSCRIBED
  → Suppression.create(contactEmail)
  → redirect to /unsubscribed-success (or return HTML)
```

---

## Feature 3B-1: Email Inbound Bidireccional

### Problem

Outbound email campaigns send from Resend/Postmark. When a contact replies, there is currently no route to receive that reply. The Inbox treats Email as outbound-only.

### Approach

Use Resend's Inbound Email webhook (or Postmark's inbound hook) to receive email replies. Both services forward parsed email to a webhook URL with sender/recipient/body. We create an `INBOUND` Message in the existing conversation system using the same `processInboundMessage()` function already used by WhatsApp.

### New Files

```
Backend/src/modules/messaging/channels/email.inbound.service.ts
Backend/src/modules/webhooks/email.webhook.routes.ts
```

### Endpoint

```
POST /webhooks/email/inbound
```

No auth header required (webhook from email provider). Signature validation via raw body + HMAC (Resend) or token comparison (Postmark).

### Resend Inbound Payload Shape

```typescript
interface ResendInboundPayload {
  from: string           // "John Doe <john@example.com>"
  to: string[]           // ["support@metria.app"]
  subject: string
  text: string
  html: string
  messageId: string
  // Resend also sends: cc, bcc, replyTo, headers, attachments
}
```

### Postmark Inbound Payload Shape

```typescript
interface PostmarkInboundPayload {
  From: string           // "john@example.com"
  FromName: string
  ToFull: Array<{ Email: string; Name: string }>
  Subject: string
  TextBody: string
  HtmlBody: string
  MessageID: string
  // Postmark also sends: Cc, Headers, Attachments, MailboxHash
}
```

### email.inbound.service.ts

```typescript
import { prisma } from '../../lib/prisma'
import { processInboundMessage } from '../messaging/message.service'

function parseSenderEmail(from: string): { email: string; name: string } {
  // Handles both "John <john@example.com>" and "john@example.com"
  const match = from.match(/^(?:"?([^"<]+)"?\s)?<?([^>]+)>?$/)
  return match
    ? { name: (match[1] ?? '').trim() || match[2], email: match[2].trim() }
    : { name: from, email: from }
}

export async function handleResendInbound(payload: ResendInboundPayload, workspaceId: string) {
  const { email, name } = parseSenderEmail(payload.from)
  return handleEmailInbound({ email, name, messageId: payload.messageId, text: payload.text }, workspaceId)
}

export async function handlePostmarkInbound(payload: PostmarkInboundPayload, workspaceId: string) {
  const { Email: email, FromName: name } = { Email: payload.From, FromName: payload.FromName }
  return handleEmailInbound({ email, name, messageId: payload.MessageID, text: payload.TextBody }, workspaceId)
}

async function handleEmailInbound(
  data: { email: string; name: string; messageId: string; text: string },
  workspaceId: string
) {
  // Find the EMAIL channel for this workspace
  const channel = await prisma.channel.findFirst({
    where: { workspaceId, platform: 'EMAIL' }
  })
  if (!channel) throw new Error('No EMAIL channel configured for workspace')

  // processInboundMessage upserts contact by phone/externalId
  // For email, we use email address as externalId (senderExternalId)
  await processInboundMessage({
    workspaceId,
    channelId: channel.id,
    externalConversationId: data.email,   // email address = conversation key
    externalMessageId: data.messageId,
    senderExternalId: data.email,
    senderName: data.name,
    content: data.text,
    mediaUrl: null,
    mediaType: null
  })
}
```

### Contact Upsert Note

`processInboundMessage` currently upserts by `workspaceId_phone`. For email-inbound contacts we use email as the "phone" field. This is a known compromise — Phase 4 will add a proper `email` unique index to contacts. For Sprint 3B, email address stored in `phone` field for email-channel contacts is acceptable.

Alternative (cleaner but more invasive): add `workspaceId_email` unique index to Contact. Deferred to Sprint 3C.

### Webhook Route

```typescript
// email.webhook.routes.ts
import express from 'express'
import { handleResendInbound, handlePostmarkInbound } from '../messaging/channels/email.inbound.service'

const router = express.Router()

router.post('/email/inbound', express.json(), async (req, res) => {
  try {
    const workspaceId = req.query.workspaceId as string
    if (!workspaceId) return res.status(400).json({ error: 'workspaceId required as query param' })

    const body = req.body

    // Auto-detect provider from payload shape
    if ('TextBody' in body) {
      // Postmark
      await handlePostmarkInbound(body, workspaceId)
    } else if ('text' in body && 'from' in body) {
      // Resend
      await handleResendInbound(body, workspaceId)
    } else {
      return res.status(400).json({ error: 'Unknown inbound email provider format' })
    }

    res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[email-inbound]', err)
    res.status(500).json({ error: 'Internal error' })
  }
})

export { router as emailWebhookRouter }
```

### Registration in app.ts

```typescript
import { emailWebhookRouter } from './modules/webhooks/email.webhook.routes'
app.use('/webhooks', emailWebhookRouter)
```

### Webhook URL to Configure

- **Resend:** Dashboard → Domains → Inbound → set endpoint to `https://<backend>/webhooks/email/inbound?workspaceId=<id>`
- **Postmark:** Servers → Inbound → set webhook URL similarly

### Success Criteria

- [ ] Reply to a campaign email → INBOUND Message appears in Inbox conversation
- [ ] MESSAGE_RECEIVED automation trigger fires for the contact
- [ ] Contact upserted if not existing; existing contact found by email
- [ ] Handles both Resend and Postmark payload shapes
- [ ] Unknown payload returns 400 (not 500)

---

## Feature 3B-2: SMS Bidireccional (Twilio)

### Problem

Outbound SMS sends via Twilio but replies aren't received. Twilio can forward incoming SMS to a webhook.

### Approach

Validate Twilio's HMAC-SHA1 signature, parse the form-encoded body, then call `processInboundMessage()` same as Feature 3B-1.

### New Files

```
Backend/src/modules/messaging/channels/sms.inbound.service.ts
Backend/src/modules/webhooks/sms.webhook.routes.ts
```

### Endpoint

```
POST /webhooks/sms/inbound
```

Content-Type: `application/x-www-form-urlencoded` (Twilio sends form data, not JSON).

### Twilio Inbound Payload Shape

Twilio sends form fields (not JSON):

```
From=+56912345678
To=+15005550006
Body=Hola quiero info
MessageSid=SMxxx
AccountSid=ACxxx
NumMedia=0
```

### Signature Validation

Twilio adds `X-Twilio-Signature` header. Must validate with `twilio.validateRequest()`:

```typescript
import twilio from 'twilio'

function validateTwilioSignature(
  authToken: string,
  webhookUrl: string,
  params: Record<string, string>,
  signature: string
): boolean {
  return twilio.validateRequest(authToken, signature, webhookUrl, params)
}
```

### sms.inbound.service.ts

```typescript
import { prisma } from '../../lib/prisma'
import { processInboundMessage } from '../messaging/message.service'
import twilio from 'twilio'

export async function handleTwilioInbound(
  params: Record<string, string>,
  signature: string,
  webhookUrl: string,
  workspaceId: string
) {
  // Find SMS channel + auth token
  const channel = await prisma.channel.findFirst({
    where: { workspaceId, platform: 'SMS' }
  })
  if (!channel) throw new Error('No SMS channel configured for workspace')

  const config = channel.config as { authToken: string; phoneNumberId?: string }

  // Validate Twilio signature
  const valid = twilio.validateRequest(config.authToken, signature, webhookUrl, params)
  if (!valid) throw new Error('Invalid Twilio signature')

  await processInboundMessage({
    workspaceId,
    channelId: channel.id,
    externalConversationId: params.From,   // sender phone = conversation key
    externalMessageId: params.MessageSid,
    senderExternalId: params.From,
    senderName: params.From,
    content: params.Body,
    mediaUrl: null,
    mediaType: null
  })
}
```

### SMS Webhook Route

```typescript
// sms.webhook.routes.ts
import express from 'express'
import { handleTwilioInbound } from '../messaging/channels/sms.inbound.service'

const router = express.Router()

// Twilio sends form-encoded data
router.post('/sms/inbound', express.urlencoded({ extended: false }), async (req, res) => {
  try {
    const workspaceId = req.query.workspaceId as string
    if (!workspaceId) return res.status(400).send('workspaceId required')

    const signature = req.headers['x-twilio-signature'] as string
    const webhookUrl = `${process.env.BACKEND_URL}/webhooks/sms/inbound?workspaceId=${workspaceId}`

    await handleTwilioInbound(req.body, signature, webhookUrl, workspaceId)

    // Twilio expects empty TwiML response (no SMS reply from server)
    res.type('text/xml').send('<Response></Response>')
  } catch (err: any) {
    console.error('[sms-inbound]', err)
    if (err.message === 'Invalid Twilio signature') {
      return res.status(403).send('Forbidden')
    }
    res.status(500).send('Internal error')
  }
})

export { router as smsWebhookRouter }
```

### Registration in app.ts

```typescript
import { smsWebhookRouter } from './modules/webhooks/sms.webhook.routes'
app.use('/webhooks', smsWebhookRouter)
```

### Required ENV

```
BACKEND_URL=https://api.metria.app   # used to reconstruct webhook URL for Twilio signature
```

### Twilio Configuration

Twilio Dashboard → Phone Numbers → [number] → Messaging → "When a message comes in" → Webhook → POST `https://api.metria.app/webhooks/sms/inbound?workspaceId=<id>`

### Success Criteria

- [ ] Reply to outbound SMS → INBOUND Message in Inbox
- [ ] Invalid Twilio signature → 403, no message created
- [ ] MESSAGE_RECEIVED automation fires
- [ ] Response is valid TwiML `<Response></Response>`

---

## Feature 3B-3: Unsubscribe Automático (CAN-SPAM)

### Problem

Outbound emails have no unsubscribe mechanism. CAN-SPAM requires one. The `Suppression` table already exists in Prisma but nothing writes to it from user action.

### Approach

1. At campaign send time (inside `campaigns.service.ts`), inject an unsubscribe link into the email footer.
2. The link URL encodes a signed HMAC token: `HMAC-SHA256(JWT_SECRET, recipientId)`.
3. `GET /unsubscribe/:token` verifies the HMAC, marks `CampaignRecipient.status = 'UNSUBSCRIBED'`, adds contact email to `Suppression`, and shows a simple success page.

Sprint 3A already injects pixel/click tracking into the HTML. Sprint 3B extends that same injection point to also append the unsubscribe footer.

### Prisma Change

`CampaignRecipient.status` currently is: `PENDING | SENT | OPENED | CLICKED | FAILED`

Add: `UNSUBSCRIBED`

```prisma
enum CampaignRecipientStatus {
  PENDING
  SENT
  OPENED
  CLICKED
  FAILED
  UNSUBSCRIBED
}
```

(If it's a plain String field, no enum migration needed — just use the string value.)

### Token Design

```typescript
import crypto from 'crypto'

function generateUnsubscribeToken(recipientId: string): string {
  const hmac = crypto.createHmac('sha256', process.env.JWT_SECRET!)
  hmac.update(recipientId)
  const sig = hmac.digest('hex')
  // Token = base64url(recipientId:sig)
  return Buffer.from(`${recipientId}:${sig}`).toString('base64url')
}

function verifyUnsubscribeToken(token: string): string {
  const decoded = Buffer.from(token, 'base64url').toString('utf-8')
  const [recipientId, sig] = decoded.split(':')
  const expected = crypto.createHmac('sha256', process.env.JWT_SECRET!).update(recipientId).digest('hex')
  if (sig !== expected) throw new Error('Invalid token')
  return recipientId
}
```

### New Files

```
Backend/src/modules/unsubscribe/unsubscribe.service.ts
Backend/src/modules/unsubscribe/unsubscribe.routes.ts
```

### unsubscribe.service.ts

```typescript
import crypto from 'crypto'
import { prisma } from '../../lib/prisma'

export function generateUnsubscribeToken(recipientId: string): string {
  const hmac = crypto.createHmac('sha256', process.env.JWT_SECRET!)
  hmac.update(recipientId)
  return Buffer.from(`${recipientId}:${hmac.digest('hex')}`).toString('base64url')
}

export function verifyUnsubscribeToken(token: string): string {
  const decoded = Buffer.from(token, 'base64url').toString('utf-8')
  const colonIdx = decoded.lastIndexOf(':')
  const recipientId = decoded.slice(0, colonIdx)
  const sig = decoded.slice(colonIdx + 1)
  const expected = crypto.createHmac('sha256', process.env.JWT_SECRET!).update(recipientId).digest('hex')
  if (sig !== expected) throw new Error('Invalid token')
  return recipientId
}

export async function processUnsubscribe(token: string): Promise<{ workspaceId: string; contactEmail: string }> {
  const recipientId = verifyUnsubscribeToken(token)

  const recipient = await prisma.campaignRecipient.findUniqueOrThrow({
    where: { id: recipientId },
    include: { contact: { select: { email: true, workspaceId: true } } }
  })

  // Idempotent: already unsubscribed is fine
  await prisma.campaignRecipient.update({
    where: { id: recipientId },
    data: { status: 'UNSUBSCRIBED' }
  })

  const email = recipient.contact.email
  const workspaceId = recipient.contact.workspaceId

  if (email) {
    // Upsert suppression (ignore if already exists)
    await prisma.suppression.upsert({
      where: { workspaceId_email: { workspaceId, email } },
      create: { workspaceId, email, reason: 'UNSUBSCRIBE' },
      update: {}
    })
  }

  return { workspaceId, contactEmail: email ?? '' }
}
```

### unsubscribe.routes.ts

```typescript
import express from 'express'
import { processUnsubscribe } from './unsubscribe.service'

const router = express.Router()

router.get('/:token', async (req, res) => {
  try {
    await processUnsubscribe(req.params.token)
    res.status(200).send(`
      <!DOCTYPE html>
      <html lang="es">
      <head><meta charset="UTF-8"><title>Desuscripción exitosa</title></head>
      <body style="font-family:sans-serif;text-align:center;padding:60px">
        <h2>✓ Te has desuscrito correctamente</h2>
        <p>No recibirás más correos de esta empresa.</p>
      </body>
      </html>
    `)
  } catch (err: any) {
    if (err.message === 'Invalid token') {
      return res.status(400).send('Enlace inválido o expirado')
    }
    console.error('[unsubscribe]', err)
    res.status(500).send('Error interno')
  }
})

export { router as unsubscribeRouter }
```

### Registration in app.ts

```typescript
import { unsubscribeRouter } from './modules/unsubscribe/unsubscribe.routes'
app.use('/unsubscribe', unsubscribeRouter)
```

### Injection into Campaign Send (campaigns.service.ts modification)

Sprint 3A already adds a `injectTrackingHTML(html, recipientId)` function that injects pixel + rewrites hrefs. Sprint 3B extends that function to also append the unsubscribe footer:

```typescript
// In campaigns.service.ts, inside the email send path:
import { generateUnsubscribeToken } from '../unsubscribe/unsubscribe.service'

function injectTrackingAndUnsubscribe(html: string, recipientId: string): string {
  const token = generateUnsubscribeToken(recipientId)
  const unsubscribeUrl = `${process.env.BACKEND_URL}/unsubscribe/${token}`

  const footer = `
    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #eee;font-size:12px;color:#888;text-align:center">
      Si no deseas recibir más correos, 
      <a href="${unsubscribeUrl}" style="color:#888">haz clic aquí para desuscribirte</a>.
    </div>
  `

  // Inject before </body> if present, else append
  if (html.includes('</body>')) {
    return html.replace('</body>', `${footer}</body>`)
  }
  return html + footer
}
```

This replaces the current `injectTrackingHTML` (Sprint 3A) with the combined function, or extends it.

### Suppression Model Assumption

Assumes the existing Prisma `Suppression` model has:
```
model Suppression {
  id          String   @id @default(cuid())
  workspaceId String
  email       String
  reason      String?
  createdAt   DateTime @default(now())
  workspace   Workspace @relation(...)

  @@unique([workspaceId, email])
}
```

If the field is named differently, adjust accordingly.

### Success Criteria

- [ ] Unsubscribe link present in every outbound email footer
- [ ] Click on link → `CampaignRecipient.status = UNSUBSCRIBED`
- [ ] Contact email added to `Suppression` table
- [ ] Subsequent campaigns skip UNSUBSCRIBED contacts (existing suppression check)
- [ ] Invalid/tampered token → 400 (not 500)
- [ ] Idempotent: clicking twice doesn't throw

---

## Files to Create

| File | Purpose |
|------|---------|
| `Backend/src/modules/messaging/channels/email.inbound.service.ts` | Resend/Postmark payload parsing + processInboundMessage call |
| `Backend/src/modules/webhooks/email.webhook.routes.ts` | POST /webhooks/email/inbound |
| `Backend/src/modules/messaging/channels/sms.inbound.service.ts` | Twilio signature validation + processInboundMessage call |
| `Backend/src/modules/webhooks/sms.webhook.routes.ts` | POST /webhooks/sms/inbound |
| `Backend/src/modules/unsubscribe/unsubscribe.service.ts` | Token gen/verify + DB writes |
| `Backend/src/modules/unsubscribe/unsubscribe.routes.ts` | GET /unsubscribe/:token |

## Files to Modify

| File | Change |
|------|--------|
| `Backend/src/app.ts` | Register 3 new routers |
| `Backend/src/modules/campaigns/campaigns.service.ts` | Extend tracking injection to include unsubscribe footer |
| `Backend/prisma/schema.prisma` | Add `UNSUBSCRIBED` to CampaignRecipient status (if enum) |

---

## Data Flow Summary

```
Email Reply
  Contact → email.example.com → Resend/Postmark → POST /webhooks/email/inbound?workspaceId=X
  → handleResendInbound() / handlePostmarkInbound()
  → processInboundMessage({ channelId: emailChannelId, senderExternalId: "email@addr" })
  → Message{direction:INBOUND} persisted
  → emitContactEvent(MESSAGE_RECEIVED) → automation resumes

SMS Reply
  Contact → sends SMS → Twilio → POST /webhooks/sms/inbound?workspaceId=X
  → validateTwilioSignature()
  → processInboundMessage({ channelId: smsChannelId, senderExternalId: "+56912..." })
  → Message{direction:INBOUND} persisted
  → emitContactEvent(MESSAGE_RECEIVED) → automation resumes

Unsubscribe
  Contact → clicks footer link → GET /unsubscribe/<hmac-token>
  → verifyUnsubscribeToken() → recipientId
  → CampaignRecipient{status:UNSUBSCRIBED}
  → Suppression{email} upserted
  → 200 HTML success page
```

---

## Dependencies

- `twilio` npm package (already in Backend/package.json for outbound SMS)
- `crypto` (Node.js built-in)
- Existing `processInboundMessage()` in `message.service.ts`
- Existing `Suppression` Prisma model
- `BACKEND_URL` env var (needed for Twilio signature reconstruction + unsubscribe URL generation)
- `JWT_SECRET` env var (already exists, reused for HMAC unsubscribe token)

---

## No New DB Models

Sprint 3B requires zero new Prisma models. Only one enum value addition (`UNSUBSCRIBED`) and reuse of existing `Suppression` model.
