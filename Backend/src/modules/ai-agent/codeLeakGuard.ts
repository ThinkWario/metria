const LEAK_MARKERS = [/^\s*tool_code\b/im, /default_api\./i, /^\s*thought\s*$/im]

/**
 * Blocks Gemini "thinking" traces and text-form pseudo tool-calls that
 * should never reach a customer (2026-07-19 incident: a leaked
 * `default_api.update_qualification(...)` call plus its thought trace went
 * straight to a WhatsApp customer). Defense-in-depth alongside the
 * qualifier/responder split — the responder still does native
 * function-calling for its 3 tools, so this failure mode is still
 * theoretically possible there.
 */
export function blockLeakedInternals(text: string): string {
  if (LEAK_MARKERS.some(re => re.test(text))) {
    console.warn('[AI Agent] Blocked leaked internal trace in AI response')
    return 'Dame un segundo, reviso eso y te confirmo.'
  }
  return text
}
