// src/hooks/useWorkspaceConfig.ts
// Backwards-compatible wrapper around useWorkspaceStore — delegates to Zustand
import { useEffect } from 'react'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'

export type { IntegrationMap } from '@/store/useWorkspaceStore'

export function useWorkspaceConfig() {
    const { integrations, isLoading, fetchIntegrations } = useWorkspaceStore()

    useEffect(() => {
        fetchIntegrations()
    }, [fetchIntegrations])

    return { integrations, isLoading }
}
