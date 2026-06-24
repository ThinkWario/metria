'use client'
import { useState, useRef, useEffect } from 'react'
import type { Conversation, Message, ConversationStatus, WorkspaceUser } from '@/hooks/useInbox'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Send, MoreVertical, Phone, Video, Search, ShieldCheck, Bot, Hand, Sparkles,
  Lock, Check, CheckCheck, Clock, AlertCircle, UserPlus, ChevronDown, MessageSquare, StickyNote
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuRadioGroup, DropdownMenuRadioItem
} from '@/components/ui/dropdown-menu'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { QuickReplyPicker, type QuickReplyPickerHandle } from './QuickReplyPicker'

const STATUS_META: Record<ConversationStatus, { label: string; dot: string }> = {
  OPEN: { label: 'Abierta', dot: 'bg-emerald-500' },
  PENDING: { label: 'Pendiente', dot: 'bg-amber-500' },
  CLOSED: { label: 'Cerrada', dot: 'bg-muted-foreground' },
}

interface Props {
  conversation: Conversation | null
  messages: Message[]
  loading: boolean
  onSend: (content: string, isInternal?: boolean) => Promise<void>
  onHandover?: (conversationId: string) => Promise<void>
  onHandback?: (conversationId: string) => Promise<void>
  onChangeStatus?: (conversationId: string, status: ConversationStatus) => Promise<void>
  onAssign?: (conversationId: string, userId: string | null) => Promise<void>
  users?: WorkspaceUser[]
}

/** Renders the real delivery state of an outbound message — never a fake "Entregado". */
function DeliveryStatus({ msg, light }: { msg: Message; light: boolean }) {
  const cls = light ? 'text-primary-foreground/60' : 'text-muted-foreground'
  if (msg.readAt) return <CheckCheck className={cn('w-3 h-3', light ? 'text-sky-300' : 'text-sky-500')} aria-label="Leído" />
  switch (msg.status) {
    case 'PENDING': return <Clock className={cn('w-3 h-3', cls)} aria-label="Enviando" />
    case 'FAILED': return <AlertCircle className="w-3 h-3 text-red-400" aria-label="Falló el envío" />
    case 'DELIVERED': return <CheckCheck className={cn('w-3 h-3', cls)} aria-label="Entregado" />
    case 'SENT': return <Check className={cn('w-3 h-3', cls)} aria-label="Enviado" />
    default: return null
  }
}

export function ChatWindow({
  conversation, messages, loading, onSend, onHandover, onHandback, onChangeStatus, onAssign, users = []
}: Props) {
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [noteMode, setNoteMode] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pickerRef = useRef<QuickReplyPickerHandle>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Reset the composer mode when switching conversations.
  useEffect(() => { setNoteMode(false); setInput('') }, [conversation?.id])

  // The "/" slash-command mode is active when the composer starts with "/".
  const slashActive = input.startsWith('/')
  const slashFilter = slashActive ? input.slice(1) : ''

  useEffect(() => {
    if (slashActive && !pickerOpen) setPickerOpen(true)
    if (!slashActive && pickerOpen) setPickerOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slashActive])

  async function handleSend() {
    if (!input.trim() || sending) return
    setSending(true)
    try {
      await onSend(input, noteMode)
      setInput('')
    } catch (err: any) {
      toast.error(err?.message || 'No se pudo enviar el mensaje')
    } finally {
      setSending(false)
    }
  }

  async function handleChangeStatus(status: ConversationStatus) {
    if (!conversation || !onChangeStatus || status === conversation.status) return
    try {
      await onChangeStatus(conversation.id, status)
      toast.success(`Conversación marcada como ${STATUS_META[status].label.toLowerCase()}`)
    } catch (err: any) {
      toast.error(err?.message || 'No se pudo cambiar el estado')
    }
  }

  async function handleAssign(userId: string | null) {
    if (!conversation || !onAssign) return
    try {
      await onAssign(conversation.id, userId)
      const name = userId ? users.find(u => u.id === userId)?.name ?? 'agente' : null
      toast.success(name ? `Asignada a ${name}` : 'Asignación removida')
    } catch (err: any) {
      toast.error(err?.message || 'No se pudo asignar la conversación')
    }
  }

  function insertQuickReply(content: string) {
    setInput(prev => {
      if (prev.startsWith('/')) return content
      const el = textareaRef.current
      const start = el?.selectionStart ?? prev.length
      const end = el?.selectionEnd ?? prev.length
      const needsSpace = start > 0 && !/\s$/.test(prev.slice(0, start))
      const insertion = (needsSpace ? ' ' : '') + content
      return prev.slice(0, start) + insertion + prev.slice(end)
    })
    setPickerOpen(false)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  function insertTopMatch() {
    pickerRef.current?.insertTopMatch()
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

  const status = conversation.status
  const assignee = conversation.assignedToUser

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background/30 overflow-hidden animate-in fade-in duration-300">
      {/* Chat Header */}
      <header className="px-6 py-4 border-b border-border/40 bg-card/50 backdrop-blur-md flex items-center justify-between shrink-0 shadow-sm gap-3">
        <div className="flex items-center gap-4 min-w-0">
          <Avatar className="h-10 w-10 border border-border/60 shrink-0">
            <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${conversation.contact?.email || conversation.id}`} />
            <AvatarFallback>{conversation.contact?.name?.charAt(0) ?? '?'}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
                <p className="text-sm font-black text-foreground leading-none truncate">{conversation.contact?.name ?? 'Contacto desconocido'}</p>
                {conversation.isHandledByBot ? (
                    <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 flex items-center gap-1 text-[9px] h-5 shrink-0">
                        <Bot className="w-3 h-3" />
                        IA Activa
                    </Badge>
                ) : (
                    <ShieldCheck className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 font-medium flex items-center gap-1.5 uppercase tracking-wider">
              <span className={cn('w-1.5 h-1.5 rounded-full', STATUS_META[status].dot, status === 'OPEN' && 'animate-pulse')} />
              {conversation.channel.name} · {STATUS_META[status].label}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
            {/* Assignment dropdown */}
            {onAssign && (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 rounded-xl border-border/40 gap-1.5 px-2.5" aria-label="Asignar conversación">
                            {assignee ? (
                                <>
                                    <Avatar className="h-4 w-4 border border-border/60">
                                        <AvatarFallback className="text-[7px] font-black bg-primary/10 text-primary">
                                            {assignee.name.charAt(0).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <span className="text-[11px] font-bold max-w-[80px] truncate">{assignee.name}</span>
                                </>
                            ) : (
                                <>
                                    <UserPlus className="w-3.5 h-3.5 text-muted-foreground" />
                                    <span className="text-[11px] font-bold text-muted-foreground">Asignar</span>
                                </>
                            )}
                            <ChevronDown className="w-3 h-3 opacity-50" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56 rounded-xl">
                        <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground font-black">Asignar a</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuRadioGroup
                            value={conversation.assignedToUserId ?? 'none'}
                            onValueChange={v => handleAssign(v === 'none' ? null : v)}
                        >
                            <DropdownMenuRadioItem value="none" className="text-xs rounded-lg">Sin asignar</DropdownMenuRadioItem>
                            {users.map(u => (
                                <DropdownMenuRadioItem key={u.id} value={u.id} className="text-xs rounded-lg">
                                    <div className="flex items-center gap-2">
                                        <Avatar className="h-5 w-5 border border-border/60">
                                            <AvatarFallback className="text-[8px] font-black bg-primary/10 text-primary">
                                                {(u.name ?? u.email).charAt(0).toUpperCase()}
                                            </AvatarFallback>
                                        </Avatar>
                                        <span className="truncate">{u.name ?? u.email}</span>
                                    </div>
                                </DropdownMenuRadioItem>
                            ))}
                            {users.length === 0 && (
                                <DropdownMenuItem disabled className="text-xs text-muted-foreground">Sin miembros disponibles</DropdownMenuItem>
                            )}
                        </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                </DropdownMenu>
            )}

            {/* Status select */}
            {onChangeStatus && (
                <Select value={status} onValueChange={v => handleChangeStatus(v as ConversationStatus)}>
                    <SelectTrigger className="h-8 w-[120px] rounded-xl border-border/40 text-[11px] font-bold gap-1" aria-label="Cambiar estado">
                        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', STATUS_META[status].dot)} />
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                        <SelectItem value="OPEN" className="text-xs rounded-lg">Abierta</SelectItem>
                        <SelectItem value="PENDING" className="text-xs rounded-lg">Pendiente</SelectItem>
                        <SelectItem value="CLOSED" className="text-xs rounded-lg">Cerrada</SelectItem>
                    </SelectContent>
                </Select>
            )}

            {conversation.isHandledByBot && onHandover && (
                <Button
                    variant="outline"
                    size="sm"
                    className="ml-1 h-8 rounded-xl bg-amber-500/10 border-amber-500/30 text-amber-600 hover:bg-amber-500/20"
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
                    className="ml-1 h-8 rounded-xl bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
                    onClick={() => onHandback(conversation.id)}
                >
                    <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                    Devolver a IA
                </Button>
            )}
            <Button aria-label="Llamar" title="Próximamente" disabled variant="ghost" size="icon" className="rounded-xl hover:bg-primary/10 transition-colors"><Phone className="w-4 h-4" /></Button>
            <Button aria-label="Videollamada" title="Próximamente" disabled variant="ghost" size="icon" className="rounded-xl hover:bg-primary/10 transition-colors"><Video className="w-4 h-4" /></Button>
            <Button aria-label="Buscar en conversación" title="Próximamente" disabled variant="ghost" size="icon" className="rounded-xl hover:bg-primary/10 transition-colors"><Search className="w-4 h-4" /></Button>
            <Button aria-label="Más opciones" title="Próximamente" disabled variant="ghost" size="icon" className="rounded-xl hover:bg-primary/10 transition-colors"><MoreVertical className="w-4 h-4" /></Button>
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
          messages.map((msg) => {
            // Internal team notes — never sent to the customer; rendered as a distinct annotation.
            if (msg.isInternal && msg.senderType !== 'SYSTEM') {
                return (
                    <div key={msg.id} className="flex justify-center my-2 animate-in fade-in zoom-in duration-300">
                        <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 shadow-sm">
                            <div className="flex items-center gap-1.5 mb-1 text-amber-600 dark:text-amber-400">
                                <Lock className="w-3 h-3" />
                                <span className="text-[9px] font-black uppercase tracking-widest">Nota interna</span>
                            </div>
                            <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                            <div className="text-[9px] mt-1.5 text-amber-600/70 dark:text-amber-400/70 font-medium">
                                {format(new Date(msg.sentAt), 'HH:mm', { locale: es })} · Solo visible para el equipo
                            </div>
                        </div>
                    </div>
                )
            }

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
                        {msg.direction === 'OUTBOUND' && <DeliveryStatus msg={msg} light={msg.senderType !== 'BOT'} />}
                    </div>
                </div>
                </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input Area */}
      <div className="p-6 bg-card/50 backdrop-blur-xl border-t border-border/40 shrink-0">
        {/* Mode toggle: reply to the customer vs. private internal note */}
        <div className="max-w-4xl mx-auto mb-3 flex items-center gap-1 p-1 rounded-xl bg-muted/40 border border-border/40 w-fit">
            <button
                onClick={() => setNoteMode(false)}
                aria-pressed={!noteMode}
                className={cn(
                    "flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-tight transition-all",
                    !noteMode ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
            >
                <MessageSquare className="w-3 h-3" /> Responder
            </button>
            <button
                onClick={() => setNoteMode(true)}
                aria-pressed={noteMode}
                className={cn(
                    "flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-tight transition-all",
                    noteMode ? 'bg-amber-500/20 text-amber-600 shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
            >
                <StickyNote className="w-3 h-3" /> Nota interna
            </button>
        </div>

        <div className="relative flex items-end gap-2 max-w-4xl mx-auto">
            <div className="pb-1">
                <QuickReplyPicker
                    ref={pickerRef}
                    open={pickerOpen}
                    onOpenChange={setPickerOpen}
                    filter={slashFilter}
                    onInsert={insertQuickReply}
                />
            </div>
            <div className="flex-1 relative group">
                <textarea
                    ref={textareaRef}
                    rows={1}
                    className={cn(
                        "w-full rounded-2xl border bg-background/50 pl-4 pr-12 py-3.5 text-sm focus:outline-none focus:ring-2 transition-all resize-none shadow-inner",
                        noteMode
                            ? 'border-amber-500/40 focus:ring-amber-500/20 bg-amber-500/5 group-hover:border-amber-500/60'
                            : 'border-border/60 focus:ring-primary/20 group-hover:border-primary/40'
                    )}
                    placeholder={noteMode
                        ? 'Escribe una nota interna para tu equipo... (no se envía al cliente)'
                        : 'Escribe tu respuesta aquí... (escribe / para respuestas rápidas)'}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                        if (slashActive && e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            insertTopMatch()
                            return
                        }
                        if (slashActive && e.key === 'Escape') {
                            e.preventDefault()
                            setPickerOpen(false)
                            setInput('')
                            return
                        }
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
                    className={cn(
                        "absolute right-2 bottom-2 rounded-xl",
                        noteMode ? 'text-amber-600 hover:bg-amber-500/10' : 'text-primary hover:bg-primary/10'
                    )}
                    onClick={handleSend}
                    disabled={!input.trim() || sending}
                    aria-label={noteMode ? 'Guardar nota interna' : 'Enviar mensaje'}
                >
                    {noteMode
                        ? <Lock className={cn("w-4 h-4 transition-transform", sending ? "animate-pulse" : "")} />
                        : <Send className={cn("w-4 h-4 transition-transform", sending ? "animate-ping" : "")} />}
                </Button>
            </div>
        </div>
        <p className="text-[9px] text-center text-muted-foreground mt-3 uppercase tracking-tighter font-medium opacity-50">
            {noteMode
                ? 'Las notas internas solo las ve tu equipo · Nunca se envían al cliente'
                : 'Shift + Enter para nueva línea · Escribe / para respuestas rápidas'}
        </p>
      </div>
    </div>
  )
}
