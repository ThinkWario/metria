import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

vi.mock('@/lib/api')
vi.mock('@/lib/socket', () => ({ getSocket: () => null }))
vi.mock('@/store/useUserStore', () => ({
  useUserStore: (selector: (s: any) => unknown) => selector({ user: { id: 'user-1', workspaceId: 'ws-1' } })
}))

import { useInbox } from '../useInbox'
import { fetchAPI } from '@/lib/api'

const mockFetchAPI = vi.mocked(fetchAPI)

const conv1 = {
  id: 'conv-1', status: 'OPEN', messageCount: 1, isHandledByBot: true,
  contact: { id: 'contact-1', name: 'Ana', phone: '+56900000001', status: 'LEAD', ltv: 0, source: 'MANUAL' },
  channel: { id: 'ch-1', platform: 'WHATSAPP', name: 'WhatsApp' }, createdAt: '2026-01-01T00:00:00.000Z'
}
const conv2 = { ...conv1, id: 'conv-2', contact: { ...conv1.contact, id: 'contact-2', name: 'Beto' } }

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchAPI.mockImplementation((url: string) => {
    if (url === '/users') return Promise.resolve([])
    if (url.startsWith('/messaging/conversations?')) return Promise.resolve([conv1, conv2])
    return Promise.resolve({})
  })
})

describe('useInbox — deleteConversation', () => {
  it('optimistically removes the conversation and clears selection when it was selected', async () => {
    const { result } = renderHook(() => useInbox())
    await waitFor(() => expect(result.current.conversations).toHaveLength(2))

    act(() => result.current.setSelectedId('conv-1'))
    expect(result.current.selectedId).toBe('conv-1')

    mockFetchAPI.mockImplementationOnce(() => Promise.resolve({}))
    await act(async () => {
      await result.current.deleteConversation('conv-1')
    })

    expect(result.current.conversations.map(c => c.id)).toEqual(['conv-2'])
    expect(result.current.selectedId).toBeNull()
    expect(mockFetchAPI).toHaveBeenCalledWith('/messaging/conversations/conv-1', { method: 'DELETE' })
  })

  it('restores the conversation at its original position when the request fails', async () => {
    const { result } = renderHook(() => useInbox())
    await waitFor(() => expect(result.current.conversations).toHaveLength(2))

    mockFetchAPI.mockImplementationOnce(() => Promise.reject(new Error('403 plan not allowed')))
    await act(async () => {
      await expect(result.current.deleteConversation('conv-1')).rejects.toThrow('403 plan not allowed')
    })

    expect(result.current.conversations.map(c => c.id)).toEqual(['conv-1', 'conv-2'])
  })
})
