import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface CampaignState {
    disabledCampaignIds: string[]
    toggleCampaign: (id: string) => void
    setDisabledCampaignIds: (ids: string[]) => void
    clearFilters: () => void
    reset: () => void
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
            reset: () => set({ disabledCampaignIds: [] }),
        }),
        {
            // TODO(tech-debt): persist key is workspace-agnostic, so disabled-campaign
            // filters leak across workspaces. Scope the key to the active workspaceId
            // (e.g. `campaign-filters:${workspaceId}`) once it's reachable here.
            name: 'campaign-filters',
        }
    )
)
