// src/lib/api.ts

import { API_BASE_URL } from './constants'

// Helperes for fetching API

export const fetchAPI = async (endpoint: string, options: RequestInit = {}) => {
    try {
        // In real environment, we get the JWT from localStorage
        let token = ''
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('metria_token')
            if (saved) token = saved
        }

        const headers = {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            ...options.headers,
        }

        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers,
        })

        if (!response.ok) {
            let msg = `API error: ${response.statusText}`
            let code = ''
            try {
                const errData = await response.json()
                if (errData.error) msg = errData.error
                else if (errData.message) msg = errData.message
                if (errData.code) code = errData.code
            } catch (e) { }

            // Handle Trial Expired or Subscription Required
            if (response.status === 403 && (code === 'TRIAL_EXPIRED' || code === 'SUBSCRIPTION_REQUIRED')) {
                if (typeof window !== 'undefined') {
                    window.location.href = '/onboarding/plans?reason=' + code
                }
            }

            // Token missing or expired — clear localStorage and redirect to logout so the
            // httpOnly session cookie is also cleared (prevents the login→dashboard redirect loop)
            if (response.status === 401 && typeof window !== 'undefined') {
                localStorage.removeItem('metria_token')
                // Reset all Zustand stores so stale workspace data doesn't leak across sessions
                try {
                    const { useUserStore } = await import('@/store/useUserStore')
                    const { useWorkspaceStore } = await import('@/store/useWorkspaceStore')
                    const { useCampaignStore } = await import('@/store/useCampaignStore')
                    useUserStore.getState().reset()
                    useWorkspaceStore.getState().reset()
                    useCampaignStore.getState().reset()
                } catch { /* stores may not be loaded yet */ }
                window.location.href = '/api/auth/logout'
            }

            throw new Error(msg)
        }

        // Some endpoints (DELETE) respond 204 No Content — don't try to parse JSON
        if (response.status === 204) return null
        const text = await response.text()
        return text ? JSON.parse(text) : null
    } catch (error) {
        console.error(`Error fetching ${endpoint}:`, error)
        throw error
    }
}

// Settings API helper methods
export const getGlobalSettings = () => fetchAPI('/settings/global')
export const updateGlobalSettings = (data: Record<string, unknown>) => fetchAPI('/settings/global', {
    method: 'POST',
    body: JSON.stringify(data)
})

export const getIntegrations = () => fetchAPI('/settings/integrations')
export const updateIntegration = (data: Record<string, unknown>) => fetchAPI('/settings/integrations', {
    method: 'POST',
    body: JSON.stringify(data)
})

// Admin API helper methods
export const getAdminWorkspaces = () => fetchAPI('/admin/workspaces')
export const createWorkspace = (name: string, adminEmail: string) => fetchAPI('/admin/workspaces', {
    method: 'POST',
    body: JSON.stringify({ name, adminEmail })
})
export const toggleWorkspaceStatus = (id: string) => fetchAPI(`/admin/workspaces/${id}/toggle`, { method: 'POST' })
export const changeWorkspacePlan = (id: string, plan: string, subscriptionStatus: string) =>
    fetchAPI(`/admin/workspaces/${id}/plan`, { method: 'PATCH', body: JSON.stringify({ plan, subscriptionStatus }) })
export const impersonateWorkspace = (targetWorkspaceId: string) => fetchAPI('/admin/workspaces/impersonate', {
    method: 'POST',
    body: JSON.stringify({ targetWorkspaceId })
})
export const stopImpersonating = () => fetchAPI('/admin/workspaces/impersonate/stop', { method: 'POST' })
export const getAdminUsers = (workspaceId?: string) => fetchAPI(`/admin/users${workspaceId ? `?workspaceId=${workspaceId}` : ''}`)
export const resetUserPassword = (id: string) => fetchAPI(`/admin/users/${id}/reset-password`, { method: 'POST' })
export const getAdminSettings = () => fetchAPI('/admin/settings')
export const updateAdminSetting = (key: string, value: string) => fetchAPI('/admin/settings', {
    method: 'POST',
    body: JSON.stringify({ key, value })
})

// Auth special helpers
export const forceChangePassword = (newPassword: string, tempToken: string) => fetchAPI('/auth/force-change-password', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tempToken}` },
    body: JSON.stringify({ newPassword })
})

// Integration extra helpers
export const syncShopifyOrders = () => fetchAPI('/shopify/sync', { method: 'POST' })
export const getCustomersLtv = (from?: string, to?: string) => 
    fetchAPI(`/metrics/customers-ltv${from && to ? `?from=${from}&to=${to}` : ''}`)
export const getReturns = (from?: string, to?: string) => 
    fetchAPI(`/metrics/returns${from && to ? `?from=${from}&to=${to}` : ''}`)
export const getSystemLogs = () => fetchAPI('/logs')

// AI Agent API methods
export const getAiAgent = () => fetchAPI('/bot/agent')
export const updateAiAgent = (agentId: string, data: Record<string, unknown>) => fetchAPI(`/bot/agent/${agentId}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
})
export const previewAgentPrompt = (): Promise<{ prompt: string }> => fetchAPI('/bot/agent/preview-prompt')
export const getAiChannels = () => fetchAPI('/bot/channels')
export const toggleChannelAi = (platform: string, enabled: boolean) => fetchAPI(`/bot/channels/${platform}/ai`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled })
})
export const applyBotTemplate = (botId: string, template: string) => fetchAPI(`/bots/${botId}/apply-template`, {
    method: 'POST',
    body: JSON.stringify({ template })
})

// Branding API helpers
export type BrandingData = {
    name?: string
    logoUrl?: string | null
    primaryColor?: string | null
    brandName?: string | null
    hiddenMenuItems?: string[]
}

export const getBranding = (): Promise<BrandingData> => fetchAPI('/settings/branding')
export const updateBranding = (data: { primaryColor?: string; brandName?: string }) =>
    fetchAPI('/settings/branding', {
        method: 'PATCH',
        body: JSON.stringify(data)
    })

export const updateWorkspaceMenuVisibility = (workspaceId: string, hiddenMenuItems: string[]) =>
    fetchAPI(`/admin/workspaces/${workspaceId}/menu-visibility`, {
        method: 'PATCH',
        body: JSON.stringify({ hiddenMenuItems })
    })

// CRM Extended APIs
export * from './crm-timeline-api'
export * from './crm-segments-api'
export * from './crm-forecast-api'
