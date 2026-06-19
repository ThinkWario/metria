import { fetchAPI } from './api'

// ── Types ──────────────────────────────────────────────────────────────────────

export type CampaignChannel = 'EMAIL' | 'SMS' | 'WHATSAPP'
export type CampaignStatus = 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'SENT' | 'FAILED'

export interface CampaignStats {
  total: number
  sent: number
  failed: number
}

export interface Campaign {
  id: string
  workspaceId: string
  name: string
  channel: CampaignChannel
  subject: string | null
  body: string
  segmentId: string | null
  status: CampaignStatus
  scheduledAt: string | null
  sentAt: string | null
  stats: CampaignStats | null
  createdAt: string
  updatedAt: string
}

/** Shape returned by listCampaigns — adds derived counts. */
export interface CampaignListItem extends Campaign {
  recipientCount: number
  sentCount: number
}

/** Shape returned by getCampaign — adds recipient breakdown + segment summary. */
export interface CampaignDetail extends Campaign {
  recipientStats: Record<string, number>
  recipientCount: number
  segment: { id: string; name: string } | null
}

export interface CreateCampaignInput {
  name: string
  channel: CampaignChannel
  subject?: string | null
  body: string
  segmentId?: string | null
  scheduledAt?: string | null
}

export type UpdateCampaignInput = Partial<CreateCampaignInput>

// ── API functions ──────────────────────────────────────────────────────────────

export const listCampaigns = (): Promise<CampaignListItem[]> =>
  fetchAPI('/crm/campaigns')

export const getCampaign = (id: string): Promise<CampaignDetail> =>
  fetchAPI(`/crm/campaigns/${id}`)

export const createCampaign = (data: CreateCampaignInput): Promise<Campaign> =>
  fetchAPI('/crm/campaigns', {
    method: 'POST',
    body: JSON.stringify(data),
  })

export const updateCampaign = (id: string, data: UpdateCampaignInput): Promise<Campaign> =>
  fetchAPI(`/crm/campaigns/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })

export const deleteCampaign = (id: string): Promise<void> =>
  fetchAPI(`/crm/campaigns/${id}`, { method: 'DELETE' })

export const sendCampaign = (id: string): Promise<Campaign> =>
  fetchAPI(`/crm/campaigns/${id}/send`, { method: 'POST' })

export const previewAudience = (segmentId: string): Promise<{ count: number }> =>
  fetchAPI('/crm/campaigns/preview-audience', {
    method: 'POST',
    body: JSON.stringify({ segmentId }),
  })

export const scheduleCampaign = (id: string, scheduledAt: string): Promise<Campaign> =>
  fetchAPI(`/crm/campaigns/${id}/schedule`, {
    method: 'POST',
    body: JSON.stringify({ scheduledAt }),
  })

export const testSendCampaign = (
  id: string,
  email: string
): Promise<{ sent: boolean; to: string; reason?: string; error?: string }> =>
  fetchAPI(`/crm/campaigns/${id}/test`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
