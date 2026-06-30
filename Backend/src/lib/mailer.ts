import { getDriver } from '../modules/campaigns/drivers'

/**
 * Transactional email helper. Reuses the campaigns module's EMAIL driver
 * (Resend if RESEND_API_KEY is set, otherwise a log-only fallback) so
 * registration never breaks in environments without email configured.
 */
export async function sendWelcomeEmail(to: string, name: string): Promise<void> {
  const driver = getDriver('EMAIL')
  const subject = 'Bienvenido a Metria Metrics'
  const body = `Hola ${name},\n\nTu cuenta en Metria Metrics fue creada correctamente. Ya puedes iniciar sesión y comenzar a configurar tu workspace.\n\n— El equipo de Metria`

  const result = await driver.sendEmail(to, subject, body)
  if (!result.ok) {
    console.error(`[mailer] welcome email to ${to} failed: ${result.error}`)
  }
}
