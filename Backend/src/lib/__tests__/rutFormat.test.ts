import { describe, it, expect } from 'vitest'
import { normalizeRut } from '../rutFormat'

describe('normalizeRut', () => {
  it('strips dots and dash from a formatted RUT', () => {
    expect(normalizeRut('11.999.999-5')).toBe('119999995')
  })

  it('accepts an already-unformatted RUT', () => {
    expect(normalizeRut('119999995')).toBe('119999995')
  })

  it('uppercases a K check digit', () => {
    expect(normalizeRut('7.654.321-k')).toBe('7654321K')
  })

  it('ignores stray whitespace', () => {
    expect(normalizeRut(' 11.999.999-5 ')).toBe('119999995')
  })

  it('rejects garbage, empty, and malformed input', () => {
    expect(normalizeRut('')).toBeNull()
    expect(normalizeRut('   ')).toBeNull()
    expect(normalizeRut(null)).toBeNull()
    expect(normalizeRut(undefined)).toBeNull()
    expect(normalizeRut('not a rut')).toBeNull()
    expect(normalizeRut('123')).toBeNull()
  })
})
