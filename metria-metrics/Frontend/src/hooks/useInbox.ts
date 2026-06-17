'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { getSocket } from '@/lib/socket'
import { fetchAPI } from '@/lib/api'
import { useUserStore } from '@/store/useUserStore'

export type ConversationStatus = 'OPEN' | 'PENDING' | 'CLOSED'
/** 'ALL' is a UI-only filter value; the API maps it to "no status filter". */
export type StatusFilter = ConversationStatus | 'ALL'

export interface WorkspaceUser {
  id: string
  name: string | null
  email: string
  role?: string
  avatarUrl?: string | null
}

export interface Conversation {
  id: string
  status: ConversationStatus
  messageCount: number
  lastMessageAt?: string
  resolvedAt?: string | null
  isHandledByBot: boolean
  assignedToUserId?: string | null
  assignedToUser?: { id: string; name: string } | null
  contact: {
    id: string;
    name: string;
    phone: string;
    email?: string;
    status: string;
    ltv: number | string;
    source: string;
    leadScore?: number | null;
    leadTemperature?: string | null;
    leadType?: string | null;
    createdAt?: string;
  }
  channel: { id: string; platform: string; name: string }
  createdAt: string
}

export interface Message {
  id: string
  conversationId: string
  direction: 'INBOUND' | 'OUTBOUND'
  senderType: 'CONTACT' | 'AGENT' | 'BOT' | 'SYSTEM'
  content?: string
  isInternal?: boolean
  status?: string
  readAt?: string | null
  deliveredAt?: string | null
  sentAt: string
}

export function useInbox() {
  const currentUserId = useUserStore(s => s.user?.id ?? null)

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingConvs, setLoadingConvs] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [sendingMessage, setSendingMessage] = useState(false)

  // Team-workflow filters
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('OPEN')
  const [search, setSearch] = useState('')
  const [assignedToMe, setAssignedToMe] = useState(false)

  // Workspace members for the assignment dropdown
  const [users, setUsers] = useState<WorkspaceUser[]>([])

  // Keep a live ref to selectedId so socket handlers don't need to re-subscribe on every select.
  const selectedIdRef = useRef<string | null>(null)
  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])

  // Load workspace members once (used by the assignment dropdown).
  useEffect(() => {
    fetchAPI('/users')
      .then((data: WorkspaceUser[]) => setUsers(Array.isArray(data) ? data : []))
      .catch(() => setUsers([]))
  }, [])

  // Fetch conversations whenever the status filter or (debounced) search term changes.
  useEffect(() => {
    let cancelled = false
    setLoadingConvs(true)

    const params = new URLSearchParams({ status: statusFilter })
    const term = search.trim()
    if (term) params.set('search', term)

    const debounce = setTimeout(() => {
      fetchAPI(`/messaging/conversations?${params.toString()}`)
        .then((data: Conversation[]) => { if (!cancelled) setConversations(data) })
        .catch(err => { if (!cancelled) console.error(err) })
        .finally(() => { if (!cancelled) setLoadingConvs(false) })
    }, term ? 300 : 0)

    return () => { cancelled = true; clearTimeout(debounce) }
  }, [statusFilter, search])

  // Load messages when selectedId changes
  useEffect(() => {
    if (!selectedId) { setMessages([]); return }
    setLoadingMsgs(true)
    fetchAPI(`/messaging/conversations/${selectedId}/messages`)
      .then((data: Message[]) => setMessages(data))
      .catch(console.error)
      .finally(() => setLoadingMsgs(false))
  }, [selectedId])

  // WebSocket live updates
  useEffect(() => {
    const sock = getSocket()
    if (!sock) return

    const onConvNew = (conv: Conversation) => {
      // Only surface a new conversation if it matches the active status filter.
      setConversations(prev => {
        if (prev.some(c => c.id === conv.id)) return prev
        if (statusFilter !== 'ALL' && conv.status !== statusFilter) return prev
        return [conv, ...prev]
      })
    }
    const onMsgNew = (msg: Message) => {
      if (msg.conversationId === selectedIdRef.current) {
        setMessages(prev => (prev.some(m => m.id === msg.id) ? prev : [...prev, msg]))
      }
      // Bump messageCount + move the conversation to the top of the list.
      setConversations(prev => {
        const idx = prev.findIndex(c => c.id === msg.conversationId)
        if (idx === -1) return prev
        const updated = { ...prev[idx], messageCount: prev[idx].messageCount + 1, lastMessageAt: msg.sentAt }
        return [updated, ...prev.slice(0, idx), ...prev.slice(idx + 1)]
      })
    }
    const onConvUpdated = (patch: Partial<Conversation> & { id: string }) => {
      setConversations(prev => {
        const next = prev.map(c => (c.id === patch.id ? { ...c, ...patch } : c))
        // Drop conversations that no longer match the active status filter.
        if (statusFilter !== 'ALL' && patch.status && patch.status !== statusFilter) {
          return next.filter(c => c.id !== patch.id)
        }
        return next
      })
    }

    sock.on('conversation:new', onConvNew)
    sock.on('message:new', onMsgNew)
    sock.on('conversation:updated', onConvUpdated)

    return () => {
      sock.off('conversation:new', onConvNew)
      sock.off('message:new', onMsgNew)
      sock.off('conversation:updated', onConvUpdated)
    }
  }, [statusFilter])

  const sendMessage = useCallback(async (content: string, isInternal = false) => {
    if (!selectedId || !content.trim()) return
    setSendingMessage(true)
    try {
      await fetchAPI(`/messaging/conversations/${selectedId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: content.trim(), isInternal })
      })
    } catch (err) {
      setSendingMessage(false)
      throw err
    }
    setSendingMessage(false)
  }, [selectedId])

  const handoverToHuman = useCallback(async (conversationId: string) => {
    try {
      await fetchAPI(`/messaging/conversations/${conversationId}/handover`, { method: 'POST' })
      setConversations(prev => prev.map(c => c.id === conversationId ? { ...c, isHandledByBot: false } : c))
    } catch (err) {
      console.error('Handover failed', err)
    }
  }, [])

  const handbackToBot = useCallback(async (conversationId: string) => {
    try {
      await fetchAPI(`/messaging/conversations/${conversationId}/handback`, { method: 'POST' })
      setConversations(prev => prev.map(c => c.id === conversationId ? { ...c, isHandledByBot: true } : c))
    } catch (err) {
      console.error('Handback failed', err)
    }
  }, [])

  /** Optimistically change a conversation's workflow status; rolls back on failure. */
  const changeStatus = useCallback(async (conversationId: string, status: ConversationStatus) => {
    let snapshot: Conversation | undefined
    setConversations(prev => {
      snapshot = prev.find(c => c.id === conversationId)
      const next = prev.map(c =>
        c.id === conversationId
          ? { ...c, status, resolvedAt: status === 'CLOSED' ? new Date().toISOString() : null }
          : c
      )
      // If the list is filtered, the conversation may no longer belong here.
      if (statusFilter !== 'ALL' && status !== statusFilter) {
        return next.filter(c => c.id !== conversationId)
      }
      return next
    })
    try {
      await fetchAPI(`/messaging/conversations/${conversationId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      })
    } catch (err) {
      // Roll back
      if (snapshot) {
        const restore = snapshot
        setConversations(prev =>
          prev.some(c => c.id === conversationId)
            ? prev.map(c => (c.id === conversationId ? restore : c))
            : [restore, ...prev]
        )
      }
      throw err
    }
  }, [statusFilter])

  /** Optimistically assign (or unassign) a conversation; rolls back on failure. */
  const assignConversation = useCallback(async (conversationId: string, userId: string | null) => {
    const assignee = userId ? users.find(u => u.id === userId) ?? null : null
    const assignedToUser = assignee ? { id: assignee.id, name: assignee.name ?? assignee.email } : null

    let snapshot: { assignedToUserId?: string | null; assignedToUser?: Conversation['assignedToUser'] } | undefined
    setConversations(prev => prev.map(c => {
      if (c.id !== conversationId) return c
      snapshot = { assignedToUserId: c.assignedToUserId, assignedToUser: c.assignedToUser }
      return { ...c, assignedToUserId: userId, assignedToUser }
    }))
    try {
      await fetchAPI(`/messaging/conversations/${conversationId}/assign`, {
        method: 'PATCH',
        body: JSON.stringify({ userId })
      })
    } catch (err) {
      if (snapshot) {
        const restore = snapshot
        setConversations(prev => prev.map(c => (c.id === conversationId ? { ...c, ...restore } : c)))
      }
      throw err
    }
  }, [users])

  // Client-side "assigned to me" filter layered on top of the server's status/search filter.
  const visibleConversations = assignedToMe && currentUserId
    ? conversations.filter(c => c.assignedToUserId === currentUserId)
    : conversations

  return {
    conversations: visibleConversations,
    selectedId,
    setSelectedId,
    messages,
    loadingConvs,
    loadingMsgs,
    sendingMessage,
    sendMessage,
    handoverToHuman,
    handbackToBot,
    changeStatus,
    assignConversation,
    // Filters
    statusFilter,
    setStatusFilter,
    search,
    setSearch,
    assignedToMe,
    setAssignedToMe,
    // Team
    users,
    currentUserId,
  }
}
