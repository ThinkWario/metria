import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import MarketingPage from '../app/dashboard/marketing/page'
import { fetchAPI } from '@/lib/api'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// A fresh client per test — a module-level shared client leaks cache/pending
// state between tests (test 1's never-resolving query would block test 2).
let queryClient: QueryClient
beforeEach(() => {
    vi.clearAllMocks()
    queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
    })
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

        // The page fires several independent queries (campaigns, creatives,
        // attribution) whose execution order isn't guaranteed, so resolve by URL
        // instead of by call order.
        ; (fetchAPI as any).mockImplementation((url: string) => {
            if (url.startsWith('/meta/campaigns')) return Promise.resolve(mockCampaigns)
            if (url.startsWith('/meta/creatives')) return Promise.resolve(mockCreatives)
            if (url.startsWith('/meta/attribution')) return Promise.resolve({ attributed: 0, orphaned: 0, total: 0, lossRate: 0 })
            return Promise.resolve([])
        })

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
