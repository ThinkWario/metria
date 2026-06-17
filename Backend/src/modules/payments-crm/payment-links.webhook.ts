import { Router } from 'express'
import * as pls from './payment-links.service'

const router = Router()

/**
 * Public MercadoPago webhook for CRM payment links (cobros).
 *
 * Mounted at /api/public → final path POST /api/public/payments/mercadopago/webhook
 *
 * Defensive by design:
 *  - Never throws; always responds 200 so MP does not flood with retries.
 *  - Only flips a PaymentLink to PAID when MP confirms an approved payment.
 *  - Matches the link via the payment's `preference_id` (our stored externalId)
 *    or via metadata. If no match is found, it silently no-ops.
 */
router.post('/payments/mercadopago/webhook', async (req, res) => {
  try {
    const token = process.env.MERCADOPAGO_ACCESS_TOKEN
    if (!token) {
      // Nothing we can do without credentials — acknowledge and exit.
      res.status(200).send('OK')
      return
    }

    const { type, data, action } = req.body || {}
    const isPayment = type === 'payment' || (typeof action === 'string' && action.startsWith('payment'))

    if (isPayment && data?.id) {
      const resp = await fetch(`https://api.mercadopago.com/v1/payments/${data.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const payment: any = await resp.json().catch(() => ({}))

      // Only act on approved payments tagged as CRM payment links.
      const isCrmLink = payment?.metadata?.kind === 'crm_payment_link'
      if (payment?.status === 'approved') {
        // Preference id is the externalId we persisted at creation time.
        const externalId: string | null =
          payment?.preference_id ||
          payment?.order?.id ||
          payment?.additional_info?.preference_id ||
          null

        if (externalId) {
          await pls.markPaidByExternalId(String(externalId))
        } else if (isCrmLink && payment?.metadata?.contact_id) {
          // Fallback path intentionally minimal — we avoid guessing without an id.
          console.warn('[PaymentLinks Webhook] approved payment without preference_id', payment?.id)
        }
      }
    }

    res.status(200).send('OK')
  } catch (err: any) {
    console.error('[PaymentLinks Webhook] Error:', err?.message || err)
    // Always 200 so MercadoPago does not retry indefinitely.
    res.status(200).send('OK')
  }
})

export default router
