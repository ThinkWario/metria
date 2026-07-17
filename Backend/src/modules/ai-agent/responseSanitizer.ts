export interface LanguageGuard {
  /** Ordered regex replacements applied to the AI's final text, case-insensitive. */
  bannedPhrases?: { pattern: string; replacement: string }[]
  /** Strips literal '*' and '_' markdown-emphasis characters. Off by default — some tenants want WhatsApp bold formatting preserved. */
  stripMarkdownEmphasis?: boolean
}

/** Deterministic last-line-of-defense pass over the AI's final text, applied before send. */
export function sanitizeResponse(text: string, guard?: LanguageGuard): string {
  let result = text

  if (guard?.stripMarkdownEmphasis) {
    result = result.replace(/[*_]/g, '')
  }

  for (const { pattern, replacement } of guard?.bannedPhrases ?? []) {
    try {
      result = result.replace(new RegExp(pattern, 'gi'), replacement)
    } catch (error) {
      console.warn(`[responseSanitizer] skipping malformed bannedPhrases pattern "${pattern}":`, error)
    }
  }

  return result.replace(/\n{3,}/g, '\n\n').trim()
}
