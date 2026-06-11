import type { LLMProvider } from './types'
import { geminiProvider } from './gemini.provider'

const providers: Record<string, LLMProvider> = {
  gemini: geminiProvider
}

export function getProvider(name?: string | null): LLMProvider {
  const key = name || 'gemini'
  const provider = providers[key]
  if (!provider) throw new Error(`Unknown LLM provider: ${key}`)
  return provider
}
