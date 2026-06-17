// Shared types for campaign message drivers.

export type Channel = 'EMAIL' | 'SMS' | 'WHATSAPP'

export interface SendResult {
  ok: boolean
  /** Provider that handled (or logged) the message — useful for debugging. */
  provider: string
  /** Present when ok === false. */
  error?: string
}

/**
 * A message driver knows how to deliver a single rendered message over one or
 * more channels. Implementations must NEVER throw — they always resolve a
 * SendResult so the send engine can record per-recipient success/failure and
 * keep processing the rest of the batch.
 */
export interface MessageDriver {
  readonly name: string
  sendEmail(to: string, subject: string, body: string): Promise<SendResult>
  sendSms(to: string, body: string): Promise<SendResult>
  sendWhatsapp(to: string, body: string): Promise<SendResult>
}
