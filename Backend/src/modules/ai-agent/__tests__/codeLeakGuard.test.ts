import { describe, it, expect } from 'vitest'
import { blockLeakedInternals } from '../codeLeakGuard'

describe('blockLeakedInternals', () => {
  it('blocks the exact leaked text from the 2026-07-19 incident', () => {
    const leaked = `tool_code
print(default_api.update_qualification(contactId='🪬', data={'timeline': 'lo antes posible'}, temperature='HOT'))
print(default_api.tag_contact(contactId='🪬', name='timeline-asap'))
thought
El usuario quiere instalar el sistema solar lo antes posible...`

    expect(blockLeakedInternals(leaked)).toBe('Dame un segundo, reviso eso y te confirmo.')
  })

  it('passes plain conversational text through unchanged', () => {
    const text = '¡Hola! Claro, te cuento los planes disponibles.'
    expect(blockLeakedInternals(text)).toBe(text)
  })

  it('blocks a standalone default_api. call even without the tool_code header', () => {
    expect(blockLeakedInternals("print(default_api.tag_contact(name='x'))")).toBe('Dame un segundo, reviso eso y te confirmo.')
  })
})
