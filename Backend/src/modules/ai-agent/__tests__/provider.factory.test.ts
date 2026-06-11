import { describe, it, expect } from 'vitest'
import { getProvider } from '../providers/provider.factory'
import { geminiProvider } from '../providers/gemini.provider'

describe('provider.factory', () => {
  it('returns gemini provider by name', () => {
    expect(getProvider('gemini')).toBe(geminiProvider)
  })
  it('defaults to gemini for null/undefined', () => {
    expect(getProvider(undefined)).toBe(geminiProvider)
  })
  it('throws on unknown provider', () => {
    expect(() => getProvider('skynet')).toThrow(/Unknown LLM provider/)
  })
})
