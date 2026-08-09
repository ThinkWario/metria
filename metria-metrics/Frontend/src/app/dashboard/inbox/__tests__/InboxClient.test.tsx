import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { InboxClient } from '../InboxClient'

const { mockRouterReplace, mockUseSearchParams, mockUseInbox } = vi.hoisted(() => ({
  mockRouterReplace: vi.fn(),
  mockUseSearchParams: vi.fn(),
  mockUseInbox: vi.fn()
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockRouterReplace }),
  useSearchParams: mockUseSearchParams
}))
vi.mock('@/hooks/useInbox', () => ({ useInbox: mockUseInbox }))
vi.mock('../components/ConversationList', () => ({ ConversationList: () => <div data-testid="conversation-list" /> }))
vi.mock('../components/ChatWindow', () => ({ ChatWindow: () => <div data-testid="chat-window" /> }))
vi.mock('../components/ContactPanel', () => ({ ContactPanel: () => <div data-testid="contact-panel" /> }))
vi.mock('../components/PlatformFilterBar', () => ({ PlatformFilterBar: () => <div data-testid="platform-filter-bar" /> }))

const mockSetSelectedId = vi.fn()
const mockMarkAsRead = vi.fn()
const mockSetStatusFilter = vi.fn()

const conv1 = {
  id: 'conv-1', status: 'OPEN', messageCount: 1, lastMessageAt: '2026-01-01T00:00:00.000Z',
  isHandledByBot: true, contact: { id: 'contact-9', name: 'Herbert', phone: '+56900000001', status: 'LEAD', ltv: 0, source: 'SOLAR_DIRECT' },
  channel: { id: 'ch-1', platform: 'WHATSAPP', name: 'WhatsApp' }, createdAt: '2026-01-01T00:00:00.000Z'
}

function baseInboxState(overrides: Partial<ReturnType<typeof mockUseInbox>> = {}) {
  return {
    conversations: [conv1],
    selectedId: null,
    setSelectedId: mockSetSelectedId,
    messages: [],
    loadingConvs: false,
    loadingMsgs: false,
    sendMessage: vi.fn(), sendTemplate: vi.fn(), handoverToHuman: vi.fn(), handbackToBot: vi.fn(),
    markAsRead: mockMarkAsRead, markAsUnread: vi.fn(), changeStatus: vi.fn(), assignConversation: vi.fn(),
    statusFilter: 'OPEN', setStatusFilter: mockSetStatusFilter, platformFilter: 'ALL', setPlatformFilter: vi.fn(),
    search: '', setSearch: vi.fn(), assignedToMe: false, setAssignedToMe: vi.fn(), users: [],
    ...overrides
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('InboxClient — deep link resolution', () => {
  it('selects the conversation and clears the URL when conversationId matches under the current filter', async () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams({ conversationId: 'conv-1' }))
    mockUseInbox.mockReturnValue(baseInboxState())

    render(<InboxClient />)

    await waitFor(() => expect(mockSetSelectedId).toHaveBeenCalledWith('conv-1'))
    expect(mockMarkAsRead).toHaveBeenCalledWith('conv-1')
    expect(mockRouterReplace).toHaveBeenCalledWith('/dashboard/inbox')
  })

  it('widens the status filter to ALL when the conversation is not visible under the current filter, then selects it once loaded', async () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams({ conversationId: 'conv-closed' }))
    const closedConv = { ...conv1, id: 'conv-closed', status: 'CLOSED' }
    mockUseInbox
      .mockReturnValueOnce(baseInboxState({ conversations: [conv1] })) // first render: not found under OPEN
      .mockReturnValue(baseInboxState({ conversations: [conv1, closedConv], statusFilter: 'ALL' }))

    render(<InboxClient />)

    await waitFor(() => expect(mockSetStatusFilter).toHaveBeenCalledWith('ALL'))
  })

  it('resolves contactId to the contact\'s conversation and selects it', async () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams({ contactId: 'contact-9' }))
    mockUseInbox.mockReturnValue(baseInboxState())

    render(<InboxClient />)

    await waitFor(() => expect(mockSetSelectedId).toHaveBeenCalledWith('conv-1'))
  })

  it('does nothing when there is no deep-link param', async () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams())
    mockUseInbox.mockReturnValue(baseInboxState())

    render(<InboxClient />)
    await screen.findByTestId('conversation-list')

    expect(mockSetSelectedId).not.toHaveBeenCalled()
    expect(mockRouterReplace).not.toHaveBeenCalled()
  })

  it('shows a toast and clears the URL when the conversation is not found even under ALL', async () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams({ conversationId: 'conv-missing' }))
    mockUseInbox.mockReturnValue(baseInboxState({ statusFilter: 'ALL' }))

    render(<InboxClient />)

    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith('/dashboard/inbox'))
    expect(mockSetSelectedId).not.toHaveBeenCalled()
  })
})
