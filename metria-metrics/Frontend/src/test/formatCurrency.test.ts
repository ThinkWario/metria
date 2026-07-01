import { describe, it, expect } from 'vitest'
import { formatCLP, formatCLPFull } from '@/lib/formatCurrency'

describe('formatCLP', () => {
  it('formats zero and NaN as $0', () => {
    expect(formatCLP('0')).toBe('$0')
    expect(formatCLP('not-a-number')).toBe('$0')
  })

  it('formats millions with M suffix', () => {
    expect(formatCLP(3500000)).toBe('$3.5M')
  })

  it('formats thousands with K suffix', () => {
    expect(formatCLP('45000')).toBe('$45K')
  })

  it('formats small values as plain integers', () => {
    expect(formatCLP(500)).toBe('$500')
  })
})

describe('formatCLPFull', () => {
  it('formats using Intl NumberFormat CLP currency style', () => {
    expect(formatCLPFull(91240)).toBe('$91.240')
  })
})
