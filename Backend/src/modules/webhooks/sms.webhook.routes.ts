import { Router, Request, Response, urlencoded } from 'express'
import { handleInboundSms, TwilioInboundPayload } from '../messaging/channels/sms.inbound.service'

export const smsWebhookRouter = Router()

// Twilio sends inbound SMS as application/x-www-form-urlencoded
smsWebhookRouter.post(
  '/sms/inbound',
  urlencoded({ extended: false }),
  async (req: Request, res: Response) => {
    const workspaceId = req.query['workspaceId'] as string | undefined

    if (!workspaceId) {
      return res.status(400).type('text/xml').send('<Response></Response>')
    }

    const twilioSignature = (req.headers['x-twilio-signature'] as string) ?? ''
    const params = req.body as TwilioInboundPayload

    // The exact URL Twilio signed over (protocol + host + original path/query).
    const requestUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`

    const result = await handleInboundSms(workspaceId, params, twilioSignature, requestUrl)

    if (result === 'invalid_signature') {
      return res.status(403).type('text/xml').send('<Response></Response>')
    }

    // 'no_channel', 'error', and 'ok' all return 200 TwiML so Twilio doesn't retry
    return res.status(200).type('text/xml').send('<Response></Response>')
  }
)
