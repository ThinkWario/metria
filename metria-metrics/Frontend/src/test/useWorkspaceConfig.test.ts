import { describe, it, expect } from 'vitest'
import { IntegrationMap } from '@/hooks/useWorkspaceConfig'

function isConnected(status: string): boolean {
    return status === "Connected" || status === "Active"
}

function buildMap(raw: { platform: string; status: string }[]): IntegrationMap {
    const map: IntegrationMap = {
        shopify: false,
        meta: false,
        dropy: false,
        google: false,
    }
    for (const item of raw) {
        const key = item.platform.toLowerCase() as keyof IntegrationMap
        if (key in map) map[key] = isConnected(item.status)
    }
    return map
}

describe('useWorkspaceConfig (logic)', () => {
    it('returns all false for empty arrays', () => {
        expect(buildMap([])).toEqual({
            shopify: false,
            meta: false,
            dropy: false,
            google: false,
        })
    })

    it('identifies Connected statuses', () => {
        const result = buildMap([
            { platform: 'shopify', status: 'Connected' },
            { platform: 'meta', status: 'Disconnected' }
        ])
        expect(result.shopify).toBe(true)
        expect(result.meta).toBe(false)
        expect(result.dropy).toBe(false)
        expect(result.google).toBe(false)
    })

    it('identifies Active statuses', () => {
        const result = buildMap([
            { platform: 'shopify', status: 'Active' },
            { platform: 'dropy', status: 'Active' }
        ])
        expect(result.shopify).toBe(true)
        expect(result.meta).toBe(false)
        expect(result.dropy).toBe(true)
    })

    it('handles case-insensitivity in platform names', () => {
        const result = buildMap([
            { platform: 'Shopify', status: 'Connected' },
            { platform: 'META', status: 'Connected' },
            { platform: 'GooGle', status: 'Active' },
        ])
        expect(result.shopify).toBe(true)
        expect(result.meta).toBe(true)
        expect(result.google).toBe(true)
    })

    it('ignores unknown platforms gracefully', () => {
        const result = buildMap([
            { platform: 'shopify', status: 'Connected' },
            { platform: 'tiktok', status: 'Connected' }
        ] as any[])
        expect(result.shopify).toBe(true)
        expect((result as any).tiktok).toBeUndefined()
    })
})
