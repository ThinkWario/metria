import { describe, it, expect } from 'vitest'
import { stripUnknownUrls, collectUrls } from '../urlGuard'

describe('stripUnknownUrls', () => {
  it('returns text unchanged when it contains no URL', () => {
    expect(stripUnknownUrls('Hola, ¿en qué te ayudo?', new Set())).toBe('Hola, ¿en qué te ayudo?')
  })

  it('blocks a URL not present in the allow-list', () => {
    const result = stripUnknownUrls('Aquí tienes tu link: https://fake-pay.example.com/xyz', new Set())
    expect(result).not.toContain('https://')
  })

  it('allows a URL that was returned by a tool call this turn', () => {
    const url = 'https://metria.app/pay/abc123'
    const result = stripUnknownUrls(`Aquí tienes tu link: ${url}`, new Set([url]))
    expect(result).toContain(url)
  })
})

describe('collectUrls', () => {
  it('extracts URL-shaped strings out of a tool result object', () => {
    const urls = collectUrls({ success: true, paymentUrl: 'https://metria.app/pay/abc123', note: 'ok' })
    expect(urls).toEqual(['https://metria.app/pay/abc123'])
  })

  it('returns an empty array when the tool result has no URL', () => {
    expect(collectUrls({ success: true, appointmentId: 'a1' })).toEqual([])
  })
})
