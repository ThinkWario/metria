/**
 * Normalizes a Chilean RUT to a comparable canonical form: digits + check
 * digit, no dots/dashes/spaces, check digit uppercased (K). DV algorithm
 * validation happens client-side (solar's onboarding wizard); this only
 * strips formatting so "11.999.999-5" and "11999999-5" compare equal for
 * identity-collision detection (QA_CORROBORACION_DESARROLLADOR_05AGO2026.md
 * §3: RUT reuse with a new email/phone must be detectable, not silently
 * treated as a brand-new identity).
 */
export function normalizeRut(raw: string | null | undefined): string | null {
  if (!raw) return null
  const cleaned = raw.replace(/[.\s-]/g, '').toUpperCase()
  if (!/^\d{7,8}[0-9K]$/.test(cleaned)) return null
  return cleaned
}
