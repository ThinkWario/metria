import type { LLMProvider } from './types'
import { geminiProvider } from './gemini.provider'
import { nvidiaProvider } from './nvidia.provider'

const providers: Record<string, LLMProvider> = {
  gemini: geminiProvider,
  nvidia: nvidiaProvider
}

export function getProvider(name?: string | null): LLMProvider {
  const key = name || 'gemini'
  const provider = providers[key]
  if (!provider) throw new Error(`Unknown LLM provider: ${key}`)
  return provider
}
