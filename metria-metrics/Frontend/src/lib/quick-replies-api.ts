import { fetchAPI } from './api'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface QuickReply {
  id: string
  title: string
  content: string
  shortcut: string | null
  createdAt: string
}

// ── API functions ──────────────────────────────────────────────────────────────

export const listQuickReplies = (): Promise<QuickReply[]> =>
  fetchAPI('/messaging/quick-replies')

export const createQuickReply = (data: {
  title: string
  content: string
  shortcut?: string
}): Promise<QuickReply> =>
  fetchAPI('/messaging/quick-replies', {
    method: 'POST',
    body: JSON.stringify(data)
  })

export const updateQuickReply = (
  id: string,
  data: { title?: string; content?: string; shortcut?: string | null }
): Promise<QuickReply> =>
  fetchAPI(`/messaging/quick-replies/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  })

export const deleteQuickReply = (id: string): Promise<void> =>
  fetchAPI(`/messaging/quick-replies/${id}`, { method: 'DELETE' })
