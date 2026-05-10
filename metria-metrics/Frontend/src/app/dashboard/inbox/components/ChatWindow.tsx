'use client'
import { useState, useRef, useEffect } from 'react'
import type { Conversation, Message } from '@/hooks/useInbox'

interface Props {
  conversation: Conversation | null
  messages: Message[]
  loading: boolean
  onSend: (content: string) => Promise<void>
}

export function ChatWindow({ conversation, messages, loading, onSend }: Props) {
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
    } catch {
      // toast goes here in Phase 3
    } finally {
      setSending(false)
    }
  }

  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        Selecciona una conversación
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 border-r overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center gap-2 shrink-0">
        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold uppercase">
          {conversation.contact.name.charAt(0)}
        </div>
        <div>
          <p className="text-sm font-semibold">{conversation.contact.name}</p>
          <p className="text-xs text-muted-foreground">
            {conversation.channel.platform} · {conversation.status}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className={`h-8 w-48 rounded-xl bg-muted/40 animate-pulse ${i % 2 === 0 ? '' : 'ml-auto'}`}
              />
            ))}
          </div>
        ) : (
          messages.map(msg => (
            <div
              key={msg.id}
              className={`flex ${msg.direction === 'OUTBOUND' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[70%] rounded-2xl px-3 py-2 text-sm ${
                  msg.direction === 'OUTBOUND'
                    ? 'bg-primary text-primary-foreground rounded-br-sm'
                    : 'bg-muted rounded-bl-sm'
                }`}
              >
                {msg.content ?? '[media]'}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <div className="px-3 py-2 border-t flex gap-2 shrink-0">
        <input
          className="flex-1 rounded-full border bg-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="Escribe un mensaje..."
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
        <button
          onClick={handleSend}
          disabled={!input.trim() || sending}
          className="shrink-0 rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50 transition-opacity"
        >
          {sending ? '…' : 'Enviar'}
        </button>
      </div>
    </div>
  )
}
