import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js'

/**
 * Validates and normalizes a raw phone string to digits-only E.164 (e.g.
 * "56912345678"), the format WhatsApp routing (both native whatsapp-web.js
 * chat IDs and the Cloud API) expects.
 *
 * Deliberately strict: returns null for anything that doesn't validate as a
 * real phone number for the given country, rather than force-formatting it.
 * This matters beyond just "bad data in the spreadsheet" — a WhatsApp lid
 * pseudo-ID (e.g. a 14-digit internal identifier) looks superficially
 * numeric but is NOT a phone number; blindly reformatting it could produce
 * a string that happens to match a real, unrelated person's number, sending
 * them someone else's message. Validating first is what prevents that.
 */
export function normalizePhone(raw: string | null | undefined, defaultCountry: CountryCode = 'CL'): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry)
  if (!parsed || !parsed.isValid()) return null

  return parsed.number.replace('+', '')
}
