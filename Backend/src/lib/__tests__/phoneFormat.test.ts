import { describe, it, expect } from 'vitest'
import { normalizePhone } from '../phoneFormat'

describe('normalizePhone', () => {
  it('formats a Chilean mobile number in local form (defaulting to CL)', () => {
    expect(normalizePhone('9 1234 5678')).toBe('56912345678')
    expect(normalizePhone('912345678')).toBe('56912345678')
  })

  it('formats a Chilean mobile number already carrying the country code, in various raw forms', () => {
    expect(normalizePhone('+56 9 1234 5678')).toBe('56912345678')
    expect(normalizePhone('56912345678')).toBe('56912345678')
    expect(normalizePhone('+56912345678')).toBe('56912345678')
  })

  it('formats a number for a different country when it carries its own country code', () => {
    // Argentina mobile, full E.164 — defaultCountry only applies when no code is present.
    expect(normalizePhone('+5491123456789', 'CL')).toBe('5491123456789')
  })

  it('rejects a WhatsApp lid pseudo-ID instead of force-formatting it into a wrong number', () => {
    // 14 digits — not a valid length for any real phone number under CL parsing,
    // and specifically not the same shape as a genuine Chilean mobile (11 digits
    // with country code). Must return null, never a plausible-looking guess.
    expect(normalizePhone('61645766283373')).toBeNull()
  })

  it('rejects garbage, empty, and whitespace-only input', () => {
    expect(normalizePhone('')).toBeNull()
    expect(normalizePhone('   ')).toBeNull()
    expect(normalizePhone(null)).toBeNull()
    expect(normalizePhone(undefined)).toBeNull()
    expect(normalizePhone('not a phone number')).toBeNull()
    expect(normalizePhone('123')).toBeNull()
  })
})
