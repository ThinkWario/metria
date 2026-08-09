'use client'
import type { PlatformFilter } from '@/hooks/useInbox'
import { cn } from '@/lib/utils'
import { PLATFORM_ICONS } from '@/lib/platformIcons'

const PLATFORM_TABS: { value: PlatformFilter; label: string }[] = [
  { value: 'ALL', label: 'Todos' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'INSTAGRAM', label: 'Instagram' },
  { value: 'MESSENGER', label: 'Messenger' },
  { value: 'TELEGRAM', label: 'Telegram' },
]

interface Props {
  platformFilter: PlatformFilter
  onPlatformFilterChange: (platform: PlatformFilter) => void
}

/**
 * Full-width bar above the conversation list / chat / contact panel split —
 * spans enough width that all platform tabs fit without horizontal scrolling
 * (unlike squeezing them into the 320px conversation-list sidebar).
 */
export function PlatformFilterBar({ platformFilter, onPlatformFilterChange }: Props) {
  return (
    <div className="shrink-0 flex items-center gap-1.5 px-6 py-2.5 border-b border-border/40 bg-card/30 backdrop-blur-xl overflow-x-auto scrollbar-hide">
      {PLATFORM_TABS.map(tab => (
        <button
          key={tab.value}
          onClick={() => onPlatformFilterChange(tab.value)}
          aria-pressed={platformFilter === tab.value}
          className={cn(
            "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all",
            platformFilter === tab.value
              ? 'bg-primary/10 text-primary border-primary/20'
              : 'bg-background/50 text-muted-foreground border-border/40 hover:text-foreground'
          )}
        >
          {tab.value !== 'ALL' && PLATFORM_ICONS[tab.value] && (
            <img src={PLATFORM_ICONS[tab.value]} alt="" className="w-3.5 h-3.5 object-contain" />
          )}
          {tab.label}
        </button>
      ))}
    </div>
  )
}
