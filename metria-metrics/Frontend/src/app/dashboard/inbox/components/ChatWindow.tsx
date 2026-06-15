'use client'
import { useState, useRef, useEffect } from 'react'
import type { Conversation, Message } from '@/hooks/useInbox'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Send, MoreVertical, Phone, Video, Search, ShieldCheck, Bot, Hand, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Badge } from '@/components/ui/badge'

interface Props {
  conversation: Conversation | null
  messages: Message[]
  loading: boolean
  onSend: (content: string) => Promise<void>
  onHandover?: (conversationId: string) => Promise<void>
  onHandback?: (conversationId: string) => Promise<void>
}

export function ChatWindow({ conversation, messages, loading, onSend, onHandover, onHandback }: Props) {
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    if (!input.trim() || sending) return
    setSending(true)
    try {
      await onSend(input)
      setInput('')
    } catch (err: any) {
      toast.error(err?.message || 'No se pudo enviar el mensaje')
    } finally {
      setSending(false)
    }
  }

  if (!conversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-muted/5 animate-in fade-in duration-700">
        <div className="w-20 h-20 rounded-3xl bg-card border border-border/40 shadow-2xl flex items-center justify-center mb-6">
            <Send className="w-8 h-8 text-primary/40 rotate-12" />
        </div>
        <h3 className="text-lg font-black text-foreground">Tu Centro de Mensajería</h3>
        <p className="text-muted-foreground text-sm max-w-xs text-center mt-2">
            Selecciona un chat de la lista para comenzar a gestionar tus leads de forma profesional.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background/30 overflow-hidden animate-in fade-in duration-300">
      {/* Chat Header */}
      <header className="px-6 py-4 border-b border-border/40 bg-card/50 backdrop-blur-md flex items-center justify-between shrink-0 shadow-sm">
        <div className="flex items-center gap-4">
          <Avatar className="h-10 w-10 border border-border/60">
            <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${conversation.contact?.email || conversation.id}`} />
            <AvatarFallback>{conversation.contact?.name?.charAt(0) ?? '?'}</AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-2">
                <p className="text-sm font-black text-foreground leading-none">{conversation.contact?.name ?? 'Contacto desconocido'}</p>
                {conversation.isHandledByBot ? (
                    <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 flex items-center gap-1 text-[9px] h-5">
                        <Bot className="w-3 h-3" />
                        IA Activa
                    </Badge>
                ) : (
                    <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
                )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 font-medium flex items-center gap-1.5 uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {conversation.channel.name} · Activo
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
            {conversation.isHandledByBot && onHandover && (
                <Button
                    variant="outline"
                    size="sm"
                    className="mr-2 h-8 rounded-xl bg-amber-500/10 border-amber-500/30 text-amber-600 hover:bg-amber-500/20"
                    onClick={() => onHandover(conversation.id)}
                >
                    <Hand className="w-3.5 h-3.5 mr-1.5" />
                    Tomar Control
                </Button>
            )}
            {!conversation.isHandledByBot && onHandback && (
                <Button
                    variant="outline"
                    size="sm"
                    className="mr-2 h-8 rounded-xl bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
                    onClick={() => onHandback(conversation.id)}
                >
                    <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                    Devolver a IA
                </Button>
            )}
            <Button aria-label="Llamar" variant="ghost" size="icon" className="rounded-xl hover:bg-primary/10 transition-colors"><Phone className="w-4 h-4" /></Button>
            <Button aria-label="Videollamada" variant="ghost" size="icon" className="rounded-xl hover:bg-primary/10 transition-colors"><Video className="w-4 h-4" /></Button>
            <Button aria-label="Buscar en conversación" variant="ghost" size="icon" className="rounded-xl hover:bg-primary/10 transition-colors"><Search className="w-4 h-4" /></Button>
            <Button aria-label="Más opciones" variant="ghost" size="icon" className="rounded-xl hover:bg-primary/10 transition-colors"><MoreVertical className="w-4 h-4" /></Button>
        </div>
      </header>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-6 py-8 space-y-6 scrollbar-hide bg-pattern">
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={cn("flex", i % 2 === 0 ? "justify-start" : "justify-end")}>
                <div className="h-12 w-64 rounded-2xl bg-muted/40 animate-pulse shadow-inner" />
              </div>
            ))}
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isLast = idx === messages.length - 1;

            if (msg.senderType === 'SYSTEM') {
                return (
                    <div key={msg.id} className="flex justify-center my-2 animate-in fade-in zoom-in duration-500">
                        <div className="bg-muted/30 border border-border/40 rounded-full px-4 py-1 text-[10px] text-muted-foreground font-medium flex items-center gap-2">
                            <Bot className="w-3 h-3" />
                            {msg.content}
                        </div>
                    </div>
                )
            }

            return (
                <div
                key={msg.id}
                className={cn(
                    "flex flex-col animate-in slide-in-from-bottom-2 duration-300",
                    msg.direction === 'OUTBOUND' ? 'items-end' : 'items-start'
                )}
                >
                <div
                    className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-xl transition-all hover:scale-[1.02]",
                    msg.direction === 'OUTBOUND'
                        ? (msg.senderType === 'BOT' ? 'bg-indigo-600 text-white rounded-tr-sm shadow-indigo-500/20' : 'bg-primary text-primary-foreground rounded-tr-sm border border-primary/20 shadow-primary/10')
                        : 'bg-card border border-border/40 text-foreground rounded-tl-sm shadow-black/5'
                    )}
                >
                    <p className="leading-relaxed whitespace-pre-wrap">{msg.content ?? '[Archivo Multimedia]'}</p>
                    <div className={cn(
                        "text-[9px] mt-1.5 flex items-center gap-1 font-medium",
                        msg.direction === 'OUTBOUND' ? 'text-primary-foreground/60' : 'text-muted-foreground'
                    )}>
                        {msg.senderType === 'BOT' && <span className="font-bold mr-1 uppercase">IA</span>}
                        {format(new Date(msg.sentAt), 'HH:mm', { locale: es })}
                        {msg.direction === 'OUTBOUND' && <span className="text-[11px]">✓✓</span>}
                    </div>
                </div>
                {isLast && msg.direction === 'OUTBOUND' && (
                    <span className="text-[8px] font-black uppercase text-primary/60 mt-1 mr-1 tracking-widest">Entregado</span>
                )}
                </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input Area */}
      <div className="p-6 bg-card/50 backdrop-blur-xl border-t border-border/40 shrink-0">
        <div className="relative flex items-end gap-3 max-w-4xl mx-auto">
            <div className="flex-1 relative group">
                <textarea
                    rows={1}
                    className="w-full rounded-2xl border border-border/60 bg-background/50 pl-4 pr-12 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all resize-none shadow-inner group-hover:border-primary/40"
                    placeholder="Escribe tu respuesta aquí..."
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSend()
                        }
                    }}
                    disabled={sending}
                />
                <Button 
                    size="icon" 
                    variant="ghost" 
                    className="absolute right-2 bottom-2 rounded-xl text-primary hover:bg-primary/10"
                    onClick={handleSend}
                    disabled={!input.trim() || sending}
                >
                    <Send className={cn("w-4 h-4 transition-transform", sending ? "animate-ping" : "")} />
                </Button>
            </div>
        </div>
        <p className="text-[9px] text-center text-muted-foreground mt-3 uppercase tracking-tighter font-medium opacity-50">
            Shift + Enter para nueva línea · Tus mensajes son encriptados de extremo a extremo
        </p>
      </div>
    </div>
  )
}
