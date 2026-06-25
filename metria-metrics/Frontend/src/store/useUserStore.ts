// src/store/useUserStore.ts
// Global user state — replaces manual JWT decoding throughout the app
import { create } from 'zustand'
import { fetchAPI } from '@/lib/api'

export interface UserProfile {
    id: string
    name: string | null
    email: string
    phone: string | null
    role: string
    workspaceId: string | null
    workspace: { 
        name: string; 
        logoUrl: string | null;
        plan: string;
        subscriptionStatus: string;
        trialEndsAt: string | null;
    } | null
    isImpersonating?: boolean
}

export interface UserPreferences {
    theme: string
    compactMode: boolean
    emailReports: boolean
    alertMarginLow: boolean
    alertStockout: boolean
    alertRoasLow: boolean
    alertDeliveryLow: boolean
    roasThreshold: number
    deliveryThreshold: number
    webhookUrl: string | null
    defaultDateRange: string
}

const DEFAULT_PREFERENCES: UserPreferences = {
    theme: 'system',
    compactMode: false,
    emailReports: true,
    alertMarginLow: true,
    alertStockout: false,
    alertRoasLow: true,
    alertDeliveryLow: true,
    roasThreshold: 2.5,
    deliveryThreshold: 85.0,
    webhookUrl: null,
    defaultDateRange: '7d',
}

interface UserState {
    user: UserProfile | null
    preferences: UserPreferences
    isLoading: boolean
    hasFetched: boolean
    fetchMe: () => Promise<void>
    updateProfile: (data: { name?: string; phone?: string }) => Promise<void>
    changePassword: (currentPassword: string, newPassword: string) => Promise<void>
    fetchPreferences: () => Promise<void>
    updatePreferences: (data: Partial<UserPreferences>) => Promise<void>
    uploadLogo: (base64: string) => Promise<void>
    deleteLogo: () => Promise<void>
    getInitials: () => string
    getDisplayName: () => string
    reset: () => void
}

export const useUserStore = create<UserState>((set, get) => ({
    user: null,
    preferences: DEFAULT_PREFERENCES,
    isLoading: false,
    hasFetched: false,

    fetchMe: async () => {
        if (get().hasFetched) return
        set({ isLoading: true })
        try {
            const data = await fetchAPI('/users/me')
            set({
                user: data,
                preferences: data.preferences || DEFAULT_PREFERENCES,
                hasFetched: true,
            })
        } catch {
            // Token expired or invalid — stay null
        } finally {
            set({ isLoading: false })
        }
    },

    updateProfile: async (data) => {
        const result = await fetchAPI('/users/me', {
            method: 'PUT',
            body: JSON.stringify(data),
        })
        // Save new token with updated name
        if (result.token && typeof window !== 'undefined') {
            localStorage.setItem('metria_token', result.token)
        }
        set((state) => ({
            user: state.user ? { ...state.user, ...result.user } : state.user,
        }))
    },

    changePassword: async (currentPassword, newPassword) => {
        await fetchAPI('/users/me/password', {
            method: 'PUT',
            body: JSON.stringify({ currentPassword, newPassword }),
        })
    },

    fetchPreferences: async () => {
        try {
            const prefs = await fetchAPI('/users/me/preferences')
            set({ preferences: prefs })
        } catch {
            // Keep defaults
        }
    },

    updatePreferences: async (data) => {
        const prefs = await fetchAPI('/users/me/preferences', {
            method: 'PUT',
            body: JSON.stringify(data),
        })
        set({ preferences: prefs })
    },

    uploadLogo: async (base64) => {
        const result = await fetchAPI('/settings/logo', {
            method: 'POST',
            body: JSON.stringify({ logoUrl: base64 }),
        })
        set((state) => ({
            user: state.user
                ? { ...state.user, workspace: { ...state.user.workspace!, logoUrl: result.logoUrl } }
                : state.user,
        }))
    },

    deleteLogo: async () => {
        await fetchAPI('/settings/logo', { method: 'DELETE' })
        set((state) => ({
            user: state.user
                ? { ...state.user, workspace: { ...state.user.workspace!, logoUrl: null } }
                : state.user,
        }))
    },

    getInitials: () => {
        const user = get().user
        if (!user?.name) return user?.email?.slice(0, 2).toUpperCase() || 'U'
        const parts = user.name.trim().split(/\s+/)
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
        return user.name.slice(0, 2).toUpperCase()
    },

    getDisplayName: () => {
        const user = get().user
        if (!user) return 'Usuario'
        return user.name || user.email?.split('@')[0] || 'Usuario'
    },

    reset: () => set({
        user: null,
        preferences: DEFAULT_PREFERENCES,
        isLoading: false,
        hasFetched: false,
    }),
}))
