'use client'
import type { Conversation } from '@/hooks/useInbox'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { MessageSquare, Clock, CheckCircle2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

const PLATFORM_ICONS: Record<string, string> = {
  WHATSAPP: 'https://cdn-icons-png.flaticon.com/512/733/733585.png',
  INSTAGRAM: 'https://cdn-icons-png.flaticon.com/512/174/174855.png',
  TELEGRAM: 'https://cdn-icons-png.flaticon.com/512/2111/2111646.png',
  TIKTOK: 'https://cdn-icons-png.flaticon.com/512/3046/3046121.png'
}

interface Props {
  conversations: Conversation[]
  selectedId: string | null
  loading: boolean
  onSelect: (id: string) => void
}

export function ConversationList({ conversations, selectedId, loading, onSelect }: Props) {
  return (
    <aside className="w-[320px] bg-card/30 backdrop-blur-xl border-r border-border/40 flex flex-col overflow-hidden shrink-0 animate-in slide-in-from-left duration-500">
      <div className="px-6 py-6 border-b border-border/40">
        <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-black tracking-tight text-foreground flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-primary" /> Inbox
            </h2>
            <Badge variant="secondary" className="rounded-lg font-black text-[10px] uppercase tracking-widest bg-primary/10 text-primary border-primary/20">
                {conversations.length} Chats
            </Badge>
        </div>
        <div className="relative">
            <input 
                className="w-full bg-background/50 border border-border/40 rounded-xl px-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                placeholder="Buscar conversación..."
            />
        </div>
      </div>

      {loading ? (
        <div className="flex-1 space-y-4 p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-3 items-center">
                <div className="h-12 w-12 rounded-full bg-muted/40 animate-pulse" />
                <div className="flex-1 space-y-2">
                    <div className="h-3 w-3/4 bg-muted/40 animate-pulse rounded" />
                    <div className="h-2 w-1/2 bg-muted/40 animate-pulse rounded" />
                </div>
            </div>
          ))}
        </div>
      ) : conversations.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-4 opacity-20">
            <MessageSquare className="w-6 h-6" />
          </div>
          <p className="text-sm font-medium">Bandeja de entrada vacía</p>
          <p className="text-xs opacity-60">Tus conversaciones aparecerán aquí.</p>
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto scrollbar-hide py-2">
          {conversations.map(conv => (
            <li
              key={conv.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(conv.id)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onSelect(conv.id) }}
              className={cn(
                "group flex items-start gap-4 px-4 py-4 mx-2 rounded-2xl cursor-pointer transition-all duration-200 border border-transparent",
                selectedId === conv.id 
                    ? 'bg-primary/10 border-primary/20 shadow-sm shadow-primary/5' 
                    : 'hover:bg-muted/50'
              )}
            >
              <div className="relative shrink-0">
                <Avatar className="h-12 w-12 border border-border/60 group-hover:scale-105 transition-transform">
                    <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${conv.contact?.email || conv.id}`} />
                    <AvatarFallback>{conv.contact?.name?.charAt(0) ?? '?'}</AvatarFallback>
                </Avatar>
                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-background flex items-center justify-center shadow-md p-0.5 border border-border/40">
                    <img src={PLATFORM_ICONS[conv.channel.platform]} alt={conv.channel.platform} className="w-full h-full object-contain" />
                </div>
              </div>
              
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className={cn(
                      "text-sm font-bold truncate group-hover:text-primary transition-colors",
                      selectedId === conv.id ? 'text-primary' : 'text-foreground'
                  )}>
                    {conv.contact?.name ?? 'Contacto desconocido'}
                  </span>
                  <span className="text-[10px] font-medium text-muted-foreground whitespace-nowrap">
                    {conv.lastMessageAt ? formatDistanceToNow(new Date(conv.lastMessageAt), { addSuffix: false, locale: es }).replace('alrededor de ', '') : ''}
                  </span>
                </div>
                
                <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground truncate line-clamp-1">
                        {conv.status === 'OPEN' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />}
                        {conv.channel.name}
                    </p>
                    {conv.status === 'PENDING' && (
                        <Badge className="h-4 px-1.5 rounded-full bg-amber-500/20 text-amber-500 border-none text-[8px] font-black uppercase">Pendiente</Badge>
                    )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
