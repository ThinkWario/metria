import { describe, it, expect } from 'vitest'
import { sortDeals } from '@/lib/dealSort'
import type { Deal } from '@/components/crm/CreateDealModal'

function makeDeal(overrides: Partial<Deal>): Deal {
  return {
    id: 'd1', title: 'Z Deal', value: '100', status: 'OPEN',
    probability: 50, expectedCloseAt: null, createdAt: '2026-01-01',
    contact: { id: 'c1', name: 'Zoe' },
    stage: { id: 's1', name: 'Contactado', color: '#000' },
    ...overrides
  }
}

describe('sortDeals', () => {
  it('sorts by title ascending', () => {
    const deals = [makeDeal({ id: '1', title: 'Beta' }), makeDeal({ id: '2', title: 'Alpha' })]
    const sorted = sortDeals(deals, 'title', 'asc')
    expect(sorted.map(d => d.id)).toEqual(['2', '1'])
  })

  it('sorts by value descending, parsing the string value as a number', () => {
    const deals = [makeDeal({ id: '1', value: '100' }), makeDeal({ id: '2', value: '9000' })]
    const sorted = sortDeals(deals, 'value', 'desc')
    expect(sorted.map(d => d.id)).toEqual(['2', '1'])
  })

  it('sorts by contact name', () => {
    const deals = [
      makeDeal({ id: '1', contact: { id: 'c1', name: 'Zoe' } }),
      makeDeal({ id: '2', contact: { id: 'c2', name: 'Ana' } })
    ]
    const sorted = sortDeals(deals, 'contact', 'asc')
    expect(sorted.map(d => d.id)).toEqual(['2', '1'])
  })

  it('treats a missing expectedCloseAt as earliest when sorting ascending', () => {
    const deals = [
      makeDeal({ id: '1', expectedCloseAt: '2026-05-01' }),
      makeDeal({ id: '2', expectedCloseAt: null })
    ]
    const sorted = sortDeals(deals, 'expectedCloseAt', 'asc')
    expect(sorted.map(d => d.id)).toEqual(['2', '1'])
  })

  it('does not mutate the input array', () => {
    const deals = [makeDeal({ id: '1', title: 'Beta' }), makeDeal({ id: '2', title: 'Alpha' })]
    const original = [...deals]
    sortDeals(deals, 'title', 'asc')
    expect(deals).toEqual(original)
  })
})
