'use client'
import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { useInbox, type Conversation } from '@/hooks/useInbox'
import { ConversationList } from './components/ConversationList'
import { ChatWindow } from './components/ChatWindow'
import { ContactPanel } from './components/ContactPanel'
import { PlatformFilterBar } from './components/PlatformFilterBar'
import { resolveDeepLinkConversation } from './resolveDeepLinkConversation'

const WRAPPER_CLASS = '-mx-6 -my-6 md:-mx-8 md:-my-8 h-[calc(100vh-4rem)] flex flex-col overflow-hidden'

function InboxContent() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const router = useRouter()
  const searchParams = useSearchParams()
  const [deepLinkResolved, setDeepLinkResolved] = useState(false)
  const preWidenListRef = useRef<Conversation[] | null>(null)

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

  // Resolve a CRM "open chat" deep link (?conversationId= or ?contactId=) into a
  // selected conversation. Widens the status filter to ALL once if the target
  // isn't visible under the current filter before giving up.
  useEffect(() => {
    if (deepLinkResolved || loadingConvs) return
    const conversationId = searchParams.get('conversationId')
    const contactId = searchParams.get('contactId')
    if (!conversationId && !contactId) return

    const match = resolveDeepLinkConversation(conversations, { conversationId, contactId })
    if (match) {
      handleSelectConversation(match.id)
      setDeepLinkResolved(true)
      router.replace('/dashboard/inbox')
      return
    }
    if (statusFilter !== 'ALL') {
      preWidenListRef.current = conversations
      setStatusFilter('ALL')
      return
    }
    // The widened filter re-renders us before its refetch starts, so an unchanged
    // list here means the ALL results haven't landed yet — keep waiting.
    if (preWidenListRef.current === conversations) return
    // Known limitation (tech debt): resolution only searches the loaded window —
    // at most 30 conversations, most recent first — so a contact whose activity
    // is older than that window reads as "not found" even though the chat exists.
    toast.error('No pudimos abrir ese chat automáticamente — búscalo en la bandeja')
    setDeepLinkResolved(true)
    router.replace('/dashboard/inbox')
  }, [searchParams, conversations, loadingConvs, statusFilter, deepLinkResolved, handleSelectConversation, setStatusFilter, router])

  if (!mounted) {
    return (
      <div className={`${WRAPPER_CLASS} animate-pulse`}>
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
    <div className={WRAPPER_CLASS}>
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

export function InboxClient() {
  return (
    <Suspense fallback={<div className={`${WRAPPER_CLASS} animate-pulse`} />}>
      <InboxContent />
    </Suspense>
  )
}
