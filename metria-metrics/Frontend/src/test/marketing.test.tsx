import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import MarketingPage from '../app/dashboard/marketing/page'
import { fetchAPI } from '@/lib/api'

// Mock fetchAPI
vi.mock('@/lib/api', () => ({
    fetchAPI: vi.fn()
}))

// Mock Recharts to avoid issues with ResponsiveContainer
vi.mock('recharts', async () => {
    const original = await vi.importActual('recharts')
    return {
        ...original as any,
        ResponsiveContainer: ({ children }: any) => <div>{children}</div>
    }
})

describe('MarketingPage', () => {
    it('renders loading state initially', () => {
        ; (fetchAPI as any).mockReturnValue(new Promise(() => { }))
        render(<MarketingPage />)
        expect(screen.getByText(/Sincronizando con Meta Ads API/i)).toBeInTheDocument()
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

        render(<MarketingPage />)

        await waitFor(() => {
            expect(screen.getByText('Test Campaign')).toBeInTheDocument()
        })

        expect(screen.getByText('Marketing & Ads')).toBeInTheDocument()
        expect(screen.getByText('Meta API Live')).toBeInTheDocument()
    })
})
