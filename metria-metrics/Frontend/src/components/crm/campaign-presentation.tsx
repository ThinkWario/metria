import { Mail, MessageSquare, Phone } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { CampaignChannel, CampaignStatus } from '@/lib/campaigns-api'

// ── Channel identity ───────────────────────────────────────────────────────────
// Each channel keeps a consistent icon + tint so the campaign list scans by
// channel at a glance. Colors stay muted to match the CRM design language.

interface ChannelMeta {
  label: string
  Icon: LucideIcon
  /** Tailwind classes for the channel chip. */
  chip: string
}

export const CHANNEL_META: Record<CampaignChannel, ChannelMeta> = {
  EMAIL: {
    label: 'Email',
    Icon: Mail,
    chip: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
  },
  SMS: {
    label: 'SMS',
    Icon: MessageSquare,
    chip: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
  },
  WHATSAPP: {
    label: 'WhatsApp',
    Icon: Phone,
    chip: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  },
}

// ── Status identity ────────────────────────────────────────────────────────────

interface StatusMeta {
  label: string
  /** Tailwind classes for the status badge. */
  badge: string
  /** Whether to show a subtle pulse (in-flight states). */
  pulse?: boolean
}

export const STATUS_META: Record<CampaignStatus, StatusMeta> = {
  DRAFT: {
    label: 'Borrador',
    badge: 'bg-muted text-muted-foreground border-transparent',
  },
  SCHEDULED: {
    label: 'Programada',
    badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  },
  SENDING: {
    label: 'Enviando',
    badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    pulse: true,
  },
  SENT: {
    label: 'Enviada',
    badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  },
  FAILED: {
    label: 'Fallida',
    badge: 'bg-destructive/10 text-destructive border-destructive/20',
  },
}
