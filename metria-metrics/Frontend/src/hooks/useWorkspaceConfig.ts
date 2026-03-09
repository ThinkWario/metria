// src/hooks/useWorkspaceConfig.ts
// Backwards-compatible wrapper around useWorkspaceStore — delegates to Zustand
import { useEffect } from 'react'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'

export type { IntegrationMap } from '@/store/useWorkspaceStore'

export function useWorkspaceConfig() {
    const { integrations, isLoading, fetchIntegrations } = useWorkspaceStore()

    useEffect(() => {
        fetchIntegrations()

        // Re-fetch on custom event (e.g., after saving integrations in settings)
        const handleUpdate = () => useWorkspaceStore.getState().fetchIntegrations(true)
        window.addEventListener('integrations-updated', handleUpdate)
        return () => window.removeEventListener('integrations-updated', handleUpdate)
    }, [fetchIntegrations])

    return { integrations, isLoading }
}
