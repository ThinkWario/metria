import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminWorkspacesPage from '../app/admin/workspaces/page'
import * as api from '@/lib/api'

vi.mock('@/lib/api')
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}))

const mockWorkspace = {
  id: 'ws1', name: 'DrillChile', status: 'ACTIVE', plan: 'PRO', subscriptionStatus: 'ACTIVE',
  hiddenMenuItems: ['nav:tiktok-ads'], integrations: [], _count: { users: 1, orders: 0 }, metrics7d: { revenue: 0, profit: 0 }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.getAdminWorkspaces).mockResolvedValue([mockWorkspace])
  vi.mocked(api.getAdminUsers).mockResolvedValue([])
  vi.mocked(api.updateWorkspaceMenuVisibility).mockResolvedValue({ ...mockWorkspace, hiddenMenuItems: ['nav:tiktok-ads', 'integration:shopify'] })
})

describe('AdminWorkspacesPage — menu visibility modal', () => {
  it('toggling a checkbox and saving calls updateWorkspaceMenuVisibility with the new key list', async () => {
    const user = userEvent.setup()
    render(<AdminWorkspacesPage />)

    await waitFor(() => expect(screen.getByText('DrillChile')).toBeInTheDocument())

    await user.click(screen.getByLabelText('Editar visibilidad de menú de DrillChile'))
    await waitFor(() => expect(screen.getByLabelText('Shopify Store (integración)')).toBeInTheDocument())

    // TikTok Ads starts checked (already hidden); Shopify starts unchecked
    expect(screen.getByLabelText('TikTok Ads')).toBeChecked()
    expect(screen.getByLabelText('Shopify Store (integración)')).not.toBeChecked()

    await user.click(screen.getByLabelText('Shopify Store (integración)'))
    await user.click(screen.getByRole('button', { name: /guardar/i }))

    await waitFor(() => {
      expect(api.updateWorkspaceMenuVisibility).toHaveBeenCalledWith(
        'ws1',
        expect.arrayContaining(['nav:tiktok-ads', 'integration:shopify'])
      )
    })
  })
})
