import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import MarketingPage from '../app/dashboard/marketing/page'
import { fetchAPI } from '@/lib/api'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: false,
        },
    },
})

// Mock fetchAPI
vi.mock('@/lib/api', () => ({
    fetchAPI: vi.fn()
}))

// Mock next/navigation
vi.mock('next/navigation', () => ({
    useRouter: () => ({
        push: vi.fn(),
        replace: vi.fn(),
        prefetch: vi.fn(),
    }),
    useSearchParams: () => new URLSearchParams(),
    usePathname: () => '/dashboard/marketing',
}))

// Mock useUserStore, useWorkspaceConfig, useCampaignStore
vi.mock('@/store/useUserStore', () => ({
    useUserStore: () => ({
        user: { role: 'ADMIN' }
    })
}))

vi.mock('@/hooks/useWorkspaceConfig', () => ({
    useWorkspaceConfig: () => ({
        integrations: { meta: true }
    })
}))

// Mock Recharts
vi.mock('recharts', async () => {
    const original = await vi.importActual('recharts')
    return {
        ...original as any,
        ResponsiveContainer: ({ children }: any) => <div>{children}</div>
    }
})

describe('MarketingPage', () => {
    it('renders something after mounting', async () => {
        ; (fetchAPI as any).mockReturnValue(new Promise(() => { }))
        render(
            <QueryClientProvider client={queryClient}>
                <MarketingPage />
            </QueryClientProvider>
        )
        // It starts with <div /> then mounts
        await waitFor(() => {
            expect(document.querySelector('.animate-pulse')).toBeTruthy()
        }, { timeout: 2000 })
    })

    it('renders campaign table after loading', async () => {
        const mockCampaigns = [
            { id: "123", name: "Test Campaign", status: "Active", spend: "100", cpa: "10", roas: "2", cpp: "10" }
        ]
        const mockCreatives = [
            { name: "Creative 1", roas: 3.5 }
        ]

            ; (fetchAPI as any).mockResolvedValueOnce(mockCampaigns)
            ; (fetchAPI as any).mockResolvedValueOnce(mockCreatives)

        render(
            <QueryClientProvider client={queryClient}>
                <MarketingPage />
            </QueryClientProvider>
        )

        await waitFor(() => {
            expect(screen.getByText('Test Campaign')).toBeInTheDocument()
        })

        expect(screen.getByText('Marketing & Ads')).toBeInTheDocument()
        expect(screen.getByText('Meta API Live')).toBeInTheDocument()
    })
})
