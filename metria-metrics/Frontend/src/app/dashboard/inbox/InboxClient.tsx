'use client'
import { useState, useEffect, useCallback } from 'react'
import { useInbox } from '@/hooks/useInbox'
import { ConversationList } from './components/ConversationList'
import { ChatWindow } from './components/ChatWindow'
import { ContactPanel } from './components/ContactPanel'
import { PlatformFilterBar } from './components/PlatformFilterBar'

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
    sendTemplate,
    handoverToHuman,
    handbackToBot,
    markAsRead,
    markAsUnread,
    changeStatus,
    assignConversation,
    statusFilter,
    setStatusFilter,
    platformFilter,
    setPlatformFilter,
    search,
    setSearch,
    assignedToMe,
    setAssignedToMe,
    users,
  } = useInbox()

  const selectedConv = conversations.find(c => c.id === selectedId) ?? null

  // Select a conversation and immediately mark its inbound messages as read.
  const handleSelectConversation = useCallback((id: string) => {
    setSelectedId(id)
    markAsRead(id)
  }, [setSelectedId, markAsRead])

  // Escape the dashboard layout's p-6 md:p-8 padding so inbox fills the viewport
  const wrapperClass =
    '-mx-6 -my-6 md:-mx-8 md:-my-8 h-[calc(100vh-4rem)] flex flex-col overflow-hidden'

  if (!mounted) {
    return (
      <div className={`${wrapperClass} animate-pulse`}>
        <div className="h-11 bg-muted/30 border-b shrink-0" />
        <div className="flex flex-1 overflow-hidden">
          <div className="w-[320px] bg-muted/30 border-r" />
          <div className="flex-1 bg-background" />
          <div className="w-[340px] bg-muted/30 border-l" />
        </div>
      </div>
    )
  }

  return (
    <div className={wrapperClass}>
      <PlatformFilterBar platformFilter={platformFilter} onPlatformFilterChange={setPlatformFilter} />
      <div className="flex flex-1 overflow-hidden">
        <ConversationList
          conversations={conversations}
          selectedId={selectedId}
          loading={loadingConvs}
          onSelect={handleSelectConversation}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          search={search}
          onSearchChange={setSearch}
          assignedToMe={assignedToMe}
          onAssignedToMeChange={setAssignedToMe}
          onMarkAsUnread={markAsUnread}
        />
        <ChatWindow
          conversation={selectedConv}
          messages={messages}
          loading={loadingMsgs}
          onSend={sendMessage}
          onSendTemplate={sendTemplate}
          onHandover={handoverToHuman}
          onHandback={handbackToBot}
          onChangeStatus={changeStatus}
          onAssign={assignConversation}
          users={users}
        />
        <ContactPanel conversation={selectedConv} />
      </div>
    </div>
  )
}
