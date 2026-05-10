'use client'
import type { Conversation } from '@/hooks/useInbox'

const PLATFORM_COLOR: Record<string, string> = {
  WHATSAPP: 'bg-green-500',
  INSTAGRAM: 'bg-pink-500',
  TELEGRAM: 'bg-blue-500',
  TIKTOK: 'bg-neutral-900'
}

const STATUS_COLOR: Record<string, string> = {
  OPEN: 'bg-green-400',
  PENDING: 'bg-yellow-400',
  CLOSED: 'bg-neutral-400'
}

interface Props {
  conversations: Conversation[]
  selectedId: string | null
  loading: boolean
  onSelect: (id: string) => void
}

export function ConversationList({ conversations, selectedId, loading, onSelect }: Props) {
  return (
    <aside className="w-[280px] border-r flex flex-col overflow-hidden shrink-0">
      <div className="px-4 py-3 border-b font-semibold text-sm">Conversaciones</div>
      {loading ? (
        <div className="flex-1 space-y-2 p-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : conversations.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Sin conversaciones
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto">
          {conversations.map(conv => (
            <li
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className={`flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-muted/40 border-b transition-colors ${
                selectedId === conv.id ? 'bg-muted/60' : ''
              }`}
            >
              <div className="relative mt-1 shrink-0">
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold uppercase">
                  {conv.contact.name.charAt(0)}
                </div>
                <span
                  className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background ${PLATFORM_COLOR[conv.channel.platform] ?? 'bg-gray-400'}`}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-sm font-medium truncate">{conv.contact.name}</span>
                  <span
                    className={`shrink-0 w-2 h-2 rounded-full ${STATUS_COLOR[conv.status] ?? 'bg-neutral-400'}`}
                    title={conv.status}
                  />
                </div>
                <p className="text-xs text-muted-foreground truncate">{conv.channel.name}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
