import { describe, it, expect } from 'vitest'
import { filterHiddenItems } from '@/lib/menuVisibility'

describe('filterHiddenItems', () => {
  it('removes items whose key is in the hidden list', () => {
    const items = [{ key: 'nav:tiktok-ads', title: 'TikTok Ads' }, { key: 'nav:meta-ads', title: 'Meta Ads' }]
    const result = filterHiddenItems(items, ['nav:tiktok-ads'])
    expect(result).toEqual([{ key: 'nav:meta-ads', title: 'Meta Ads' }])
  })

  it('returns all items unchanged when the hidden list is empty', () => {
    const items = [{ key: 'nav:meta-ads', title: 'Meta Ads' }]
    expect(filterHiddenItems(items, [])).toEqual(items)
  })

  it('returns all items unchanged when no keys match', () => {
    const items = [{ key: 'nav:meta-ads', title: 'Meta Ads' }]
    expect(filterHiddenItems(items, ['integration:shopify'])).toEqual(items)
  })
})
