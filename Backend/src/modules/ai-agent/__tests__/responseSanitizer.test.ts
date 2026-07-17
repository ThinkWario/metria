import { describe, it, expect } from 'vitest'
import { sanitizeResponse } from '../responseSanitizer'

describe('sanitizeResponse', () => {
  it('returns the text unchanged when no guard is configured', () => {
    expect(sanitizeResponse('Hola *que* tal')).toBe('Hola *que* tal')
  })

  it('strips markdown emphasis only when stripMarkdownEmphasis is true', () => {
    expect(sanitizeResponse('Hola *que* tal', { stripMarkdownEmphasis: true })).toBe('Hola que tal')
    expect(sanitizeResponse('Hola *que* tal', { stripMarkdownEmphasis: false })).toBe('Hola *que* tal')
  })

  it('applies bannedPhrases replacements case-insensitively', () => {
    const guard = { bannedPhrases: [{ pattern: '\\bte late\\b', replacement: 'te parece' }] }
    expect(sanitizeResponse('Te Late la oferta?', guard)).toBe('te parece la oferta?')
  })

  it('collapses excess blank lines and trims', () => {
    expect(sanitizeResponse('Hola\n\n\n\nChao  ')).toBe('Hola\n\nChao')
  })
})
