// src/store/useWorkspaceStore.ts
// Shared cross-page store for workspace integrations — eliminates per-page re-fetching
import { create } from 'zustand'
import { fetchAPI } from '@/lib/api'

export type IntegrationMap = {
    shopify: boolean
    meta: boolean
    dropy: boolean
    google: boolean
}

const DEFAULT_MAP: IntegrationMap = {
    shopify: false,
    meta: false,
    dropy: false,
    google: false,
}

function isConnected(status: string): boolean {
    return status === 'Connected' || status === 'Active'
}

function buildMap(raw: { platform: string; status: string }[]): IntegrationMap {
    const map = { ...DEFAULT_MAP }
    for (const item of raw) {
        const key = item.platform.toLowerCase() as keyof IntegrationMap
        if (key in map) map[key] = isConnected(item.status)
    }
    return map
}

interface WorkspaceState {
    integrations: IntegrationMap
    isLoading: boolean
    hasFetched: boolean
    fetchIntegrations: (force?: boolean) => Promise<void>
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
    integrations: DEFAULT_MAP,
    isLoading: false,
    hasFetched: false,
    fetchIntegrations: async (force?: boolean) => {
        // Only fetch once per session — avoids N requests on navigation
        if (get().hasFetched && !force) return
        set({ isLoading: true })
        try {
            const data = await fetchAPI('/settings/integrations')
            if (Array.isArray(data)) {
                set({ integrations: buildMap(data), hasFetched: true })
            }
        } catch {
            // API down — keep all false
        } finally {
            set({ isLoading: false })
        }
    }
}))
