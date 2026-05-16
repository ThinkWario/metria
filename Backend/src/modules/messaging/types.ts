export type MessagingPlatform = 'WHATSAPP' | 'INSTAGRAM' | 'TELEGRAM' | 'TIKTOK' | 'MESSENGER'

export interface InboundMessageData {
  workspaceId: string
  channelId: string
  /** Platform-level conversation/thread identifier (chat.id for Telegram, thread_id for IG, etc.) */
  externalConversationId: string
  /** Platform-level message identifier */
  externalMessageId: string
  /** Sender's platform identifier (Telegram user ID, WhatsApp phone, Instagram user ID) */
  senderExternalId: string
  senderName?: string
  content: string
  mediaUrl?: string
  mediaType?: string
  metadata?: any
}

export interface ProcessedMessage {
  conversationId: string
  messageId: string
  contactId: string
  isNewConversation: boolean
}

// WebSocket event payloads emitted to workspace:{workspaceId}
export interface WsConversationNew {
  id: string
  channelId: string
  externalId: string
  status: string
  contact: { id: string; name: string; status: string; phone: string | null } | null
  createdAt: Date
}

export interface WsMessageNew {
  id: string
  conversationId: string
  direction: string
  senderType: string
  content: string
  sentAt: Date
}
