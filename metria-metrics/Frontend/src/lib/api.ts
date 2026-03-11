// src/lib/api.ts

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000/api'

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
            try {
                const errData = await response.json()
                if (errData.error) msg = errData.error
                else if (errData.message) msg = errData.message
            } catch (e) { }
            throw new Error(msg)
        }

        return await response.json()
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
export const impersonateWorkspace = (targetWorkspaceId: string) => fetchAPI('/admin/workspaces/impersonate', {
    method: 'POST',
    body: JSON.stringify({ targetWorkspaceId })
})
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
