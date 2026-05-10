'use client'

import { useState, useEffect, useCallback } from 'react'
import { getSocket } from '@/lib/socket'
import { fetchAPI } from '@/lib/api'

export interface Conversation {
  id: string
  status: 'OPEN' | 'PENDING' | 'CLOSED'
  messageCount: number
  lastMessageAt?: string
  contact: { id: string; name: string; phone: string }
  channel: { id: string; platform: string; name: string }
  createdAt: string
}

export interface Message {
  id: string
  conversationId: string
  direction: 'INBOUND' | 'OUTBOUND'
  senderType: 'CONTACT' | 'AGENT' | 'BOT'
  content?: string
  sentAt: string
}

export function useInbox() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingConvs, setLoadingConvs] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [sendingMessage, setSendingMessage] = useState(false)

  // Load conversations on mount
  useEffect(() => {
    fetchAPI('/messaging/conversations?status=OPEN')
      .then(res => res.json())
      .then((data: Conversation[]) => setConversations(data))
      .catch(console.error)
      .finally(() => setLoadingConvs(false))
  }, [])

  // Load messages when selectedId changes
  useEffect(() => {
    if (!selectedId) { setMessages([]); return }
    setLoadingMsgs(true)
    fetchAPI(`/messaging/conversations/${selectedId}/messages`)
      .then(res => res.json())
      .then((data: Message[]) => setMessages(data))
      .catch(console.error)
      .finally(() => setLoadingMsgs(false))
  }, [selectedId])

  // WebSocket live updates
  useEffect(() => {
    const sock = getSocket()
    if (!sock) return

    const onConvNew = (conv: Conversation) => {
      setConversations(prev => [conv, ...prev])
    }
    const onMsgNew = (msg: Message) => {
      if (msg.conversationId === selectedId) {
        setMessages(prev => [...prev, msg])
      }
      // Bump messageCount on the conversation
      setConversations(prev =>
        prev.map(c => c.id === msg.conversationId ? { ...c, messageCount: c.messageCount + 1 } : c)
      )
    }

    sock.on('conversation:new', onConvNew)
    sock.on('message:new', onMsgNew)

    return () => {
      sock.off('conversation:new', onConvNew)
      sock.off('message:new', onMsgNew)
    }
  }, [selectedId])

  const sendMessage = useCallback(async (content: string) => {
    if (!selectedId || !content.trim()) return
    setSendingMessage(true)
    try {
      await fetchAPI(`/messaging/conversations/${selectedId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim() })
      })
    } finally {
      setSendingMessage(false)
    }
  }, [selectedId])

  return {
    conversations,
    selectedId,
    setSelectedId,
    messages,
    loadingConvs,
    loadingMsgs,
    sendingMessage,
    sendMessage
  }
}
