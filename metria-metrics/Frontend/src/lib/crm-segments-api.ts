import { fetchAPI } from './api'

// ── Types ──────────────────────────────────────────────────────────────────────

export type FilterField = 'leadScore' | 'temperature' | 'contactType' | 'channel' | 'tags' | 'hasDeals' | 'isActive'
export type FilterOperator = 'eq' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'contains' | 'is_true' | 'is_false'

export interface SegmentFilter {
  field: FilterField
  operator: FilterOperator
  value: string | number | string[]
}

export interface SegmentFilters {
  logic: 'AND' | 'OR'
  filters: SegmentFilter[]
}

export interface Segment {
  id: string
  workspaceId: string
  name: string
  description: string | null
  filters: SegmentFilters
  contactCount: number
  lastCalculatedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface SegmentContact {
  id: string
  name: string
  email: string | null
  phone: string | null
  source: string
  status: string
  leadScore: number | null
  leadTemperature: string | null
  leadType: string | null
  ltv: string | number
  avatarUrl: string | null
  tags: { id: string; name: string; color: string }[]
  _count: { deals: number; conversations: number }
}

export interface SegmentContactsResponse {
  contacts: SegmentContact[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ── API functions ──────────────────────────────────────────────────────────────

export const listSegments = (): Promise<Segment[]> =>
  fetchAPI('/crm/segments')

export const getSegment = (id: string): Promise<Segment> =>
  fetchAPI(`/crm/segments/${id}`)

export const createSegment = (data: {
  name: string
  description?: string
  filters: SegmentFilters
}): Promise<Segment> =>
  fetchAPI('/crm/segments', {
    method: 'POST',
    body: JSON.stringify(data)
  })

export const updateSegment = (
  id: string,
  data: { name?: string; description?: string; filters?: SegmentFilters }
): Promise<Segment> =>
  fetchAPI(`/crm/segments/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  })

export const deleteSegment = (id: string): Promise<void> =>
  fetchAPI(`/crm/segments/${id}`, { method: 'DELETE' })

export const getSegmentContacts = (
  id: string,
  page = 1,
  pageSize = 25
): Promise<SegmentContactsResponse> =>
  fetchAPI(`/crm/segments/${id}/contacts?page=${page}&pageSize=${pageSize}`)

export const previewSegmentCount = (filters: SegmentFilters): Promise<{ count: number }> =>
  fetchAPI('/crm/segments/preview', {
    method: 'POST',
    body: JSON.stringify({ filters })
  })
