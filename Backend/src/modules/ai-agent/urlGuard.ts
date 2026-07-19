const URL_PATTERN = /https?:\/\/[^\s<>"')]+/gi
const TRAILING_PUNCTUATION = /[.,;)]+$/

const trimTrailingPunctuation = (url: string): string => url.replace(TRAILING_PUNCTUATION, '')

/**
 * Strips any URL in `text` that wasn't actually returned by a tool call this
 * turn. Metria's system prompt never instructs the AI to output raw URLs —
 * any URL that appears is either hallucinated or leaked from data it
 * shouldn't quote raw, so the conservative default (an empty allow-list)
 * blocks all of them.
 */
export function stripUnknownUrls(text: string, allowedUrls: Set<string>): string {
  const found = text.match(URL_PATTERN)
  if (!found) return text

  for (const url of found) {
    const clean = trimTrailingPunctuation(url)
    if (!allowedUrls.has(clean)) {
      console.warn('[AI Agent] Blocked unverified URL in AI response:', clean)
      return 'Dame un segundo, reviso eso y te confirmo.'
    }
  }
  return text
}

/** Collects URL-shaped strings out of a tool call's JSON result so stripUnknownUrls can allow-list them. */
export function collectUrls(toolResult: object): string[] {
  const found = JSON.stringify(toolResult).match(URL_PATTERN) ?? []
  return found.map(trimTrailingPunctuation)
}
