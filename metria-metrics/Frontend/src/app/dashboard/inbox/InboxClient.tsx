'use client'
import { useState, useEffect } from 'react'
import { useInbox } from '@/hooks/useInbox'
import { ConversationList } from './components/ConversationList'
import { ChatWindow } from './components/ChatWindow'
import { ContactPanel } from './components/ContactPanel'

export function InboxClient() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const {
    conversations,
    selectedId,
    setSelectedId,
    messages,
    loadingConvs,
    loadingMsgs,
    sendMessage,
    handoverToHuman
  } = useInbox()

  const selectedConv = conversations.find(c => c.id === selectedId) ?? null

  // Escape the dashboard layout's p-6 md:p-8 padding so inbox fills the viewport
  const wrapperClass =
    '-mx-6 -my-6 md:-mx-8 md:-my-8 h-[calc(100vh-4rem)] flex overflow-hidden'

  if (!mounted) {
    return (
      <div className={`${wrapperClass} animate-pulse`}>
        <div className="w-[280px] bg-muted/30 border-r" />
        <div className="flex-1 bg-background" />
        <div className="w-[320px] bg-muted/30 border-l" />
      </div>
    )
  }

  return (
    <div className={wrapperClass}>
      <ConversationList
        conversations={conversations}
        selectedId={selectedId}
        loading={loadingConvs}
        onSelect={setSelectedId}
      />
      <ChatWindow
        conversation={selectedConv}
        messages={messages}
        loading={loadingMsgs}
        onSend={sendMessage}
        onHandover={handoverToHuman}
      />
      <ContactPanel contact={selectedConv?.contact ?? null} />
    </div>
  )
}
