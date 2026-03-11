import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface CampaignState {
    disabledCampaignIds: string[]
    toggleCampaign: (id: string) => void
    setDisabledCampaignIds: (ids: string[]) => void
    clearFilters: () => void
}

export const useCampaignStore = create<CampaignState>()(
    persist(
        (set) => ({
            disabledCampaignIds: [],
            toggleCampaign: (id) => set((state) => ({
                disabledCampaignIds: state.disabledCampaignIds.includes(id)
                    ? state.disabledCampaignIds.filter(i => i !== id)
                    : [...state.disabledCampaignIds, id]
            })),
            setDisabledCampaignIds: (ids) => set({ disabledCampaignIds: ids }),
            clearFilters: () => set({ disabledCampaignIds: [] }),
        }),
        {
            name: 'campaign-filters',
        }
    )
)
