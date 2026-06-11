interface ChunkOptions {
  maxChars?: number
  overlapChars?: number
}

export function chunkText(text: string, opts: ChunkOptions = {}): string[] {
  const maxChars = opts.maxChars ?? 3200
  const overlapChars = opts.overlapChars ?? 400
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []
  if (clean.length <= maxChars) return [clean]

  const chunks: string[] = []
  let start = 0
  while (start < clean.length) {
    let end = Math.min(start + maxChars, clean.length)
    if (end < clean.length) {
      const lastPeriod = clean.lastIndexOf('. ', end)
      if (lastPeriod > start + maxChars * 0.5) end = lastPeriod + 1
    }
    chunks.push(clean.slice(start, end).trim())
    if (end >= clean.length) break
    start = Math.max(end - overlapChars, start + 1)
  }
  return chunks
}
