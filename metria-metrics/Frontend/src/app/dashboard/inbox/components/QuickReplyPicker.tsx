'use client'

import { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Zap, Settings2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type QuickReply, listQuickReplies } from '@/lib/quick-replies-api'
import { QuickRepliesManager } from './QuickRepliesManager'

export interface QuickReplyPickerHandle {
  /** Inserts the current top filtered match (used by the composer's Enter key). */
  insertTopMatch: () => void
}

interface QuickReplyPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Text typed after "/" in the composer used to filter the list. */
  filter?: string
  /** Inserts the selected reply's content into the composer. */
  onInsert: (content: string) => void
}

/**
 * Filters by title or shortcut (case-insensitive). When `query` is empty,
 * returns the full list.
 */
function matchReplies(replies: QuickReply[], query: string): QuickReply[] {
  const q = query.trim().toLowerCase()
  if (!q) return replies
  return replies.filter(
    r =>
      r.title.toLowerCase().includes(q) ||
      (r.shortcut?.toLowerCase().includes(q) ?? false)
  )
}

export const QuickReplyPicker = forwardRef<QuickReplyPickerHandle, QuickReplyPickerProps>(
  function QuickReplyPicker({ open, onOpenChange, filter = '', onInsert }, ref) {
    const [replies, setReplies] = useState<QuickReply[]>([])
    const [loaded, setLoaded] = useState(false)
    const [loading, setLoading] = useState(false)
    const [managerOpen, setManagerOpen] = useState(false)

    const fetchReplies = useCallback(async () => {
      setLoading(true)
      try {
        const data = await listQuickReplies()
        setReplies(data)
        setLoaded(true)
      } catch {
        // Soft-fail: keep whatever we had; the manager surfaces real errors.
      } finally {
        setLoading(false)
      }
    }, [])

    // Fetch the list whenever the picker opens (cheap, keeps it fresh).
    useEffect(() => {
      if (open) fetchReplies()
    }, [open, fetchReplies])

    const filtered = matchReplies(replies, filter)

    // Keep a ref to the latest filtered list so the imperative handle is stable.
    const filteredRef = useRef(filtered)
    filteredRef.current = filtered

    function handleInsert(reply: QuickReply) {
      onInsert(reply.content)
      onOpenChange(false)
    }

    useImperativeHandle(ref, () => ({
      insertTopMatch() {
        const top = filteredRef.current[0]
        if (top) handleInsert(top)
      }
    }))

    return (
      <>
        <Popover open={open} onOpenChange={onOpenChange}>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="Respuestas rápidas"
                    className="rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                  >
                    <Zap className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="top">Respuestas rápidas</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <PopoverContent
            align="start"
            side="top"
            sideOffset={8}
            className="w-80 p-0 overflow-hidden"
            // Keep focus in the composer when opened by typing "/".
            onOpenAutoFocus={e => e.preventDefault()}
          >
            <div className="flex items-center justify-between border-b border-border/60 px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Zap className="h-3.5 w-3.5 text-primary" />
                Respuestas rápidas
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
                onClick={() => {
                  onOpenChange(false)
                  setManagerOpen(true)
                }}
              >
                <Settings2 className="h-3.5 w-3.5" />
                Gestionar
              </Button>
            </div>

            <div className="max-h-72 overflow-y-auto p-1.5">
              {loading && !loaded ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Cargando...
                </div>
              ) : filtered.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {replies.length === 0
                    ? 'No tienes respuestas rápidas aún.'
                    : 'Sin coincidencias.'}
                </div>
              ) : (
                filtered.map((reply, idx) => (
                  <button
                    key={reply.id}
                    type="button"
                    onClick={() => handleInsert(reply)}
                    className={cn(
                      'flex w-full flex-col items-start gap-0.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-muted focus:bg-muted focus:outline-none',
                      idx === 0 && filter ? 'bg-muted/60' : ''
                    )}
                  >
                    <div className="flex w-full items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">{reply.title}</span>
                      {reply.shortcut && (
                        <Badge variant="secondary" className="ml-auto shrink-0 text-[10px] font-mono">
                          /{reply.shortcut}
                        </Badge>
                      )}
                    </div>
                    <span className="line-clamp-2 text-xs text-muted-foreground">{reply.content}</span>
                  </button>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>

        <QuickRepliesManager
          open={managerOpen}
          onOpenChange={setManagerOpen}
          onChange={setReplies}
        />
      </>
    )
  }
)
