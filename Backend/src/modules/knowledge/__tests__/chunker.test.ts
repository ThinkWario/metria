import { describe, it, expect } from 'vitest'
import { chunkText } from '../chunker'

describe('chunkText', () => {
  it('returns single chunk for short text', () => {
    expect(chunkText('hola mundo')).toEqual(['hola mundo'])
  })
  it('splits long text into chunks under maxChars with overlap', () => {
    const text = Array.from({ length: 100 }, (_, i) => `Frase número ${i} sobre paneles solares.`).join(' ')
    const chunks = chunkText(text, { maxChars: 500, overlapChars: 100 })
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(500)
    // overlap: start of chunk[1] appears near end of chunk[0]
    expect(chunks[0].slice(-100)).toContain(chunks[1].slice(0, 30))
  })
  it('ignores empty/whitespace input', () => {
    expect(chunkText('   ')).toEqual([])
  })
})
