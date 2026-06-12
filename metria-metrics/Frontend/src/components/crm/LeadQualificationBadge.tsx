import { Badge } from '@/components/ui/badge'

const TEMP_STYLES: Record<string, string> = {
  HOT: 'bg-red-500/15 text-red-500 border-red-500/30',
  WARM: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
  COLD: 'bg-sky-500/15 text-sky-400 border-sky-500/30'
}
const TEMP_LABELS: Record<string, string> = { HOT: '🔥 Caliente', WARM: 'Tibio', COLD: 'Frío' }
const TYPE_LABELS: Record<string, string> = {
  CURIOUS: 'Curioso', QUOTING: 'Cotizando', READY_TO_BUY: 'Listo para comprar', POST_SALE: 'Postventa'
}

export function LeadQualificationBadge({
  temperature, type, score
}: { temperature?: string | null; type?: string | null; score?: number | null }) {
  if (!temperature && !type && score == null) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {temperature && <Badge variant="outline" className={TEMP_STYLES[temperature] ?? ''}>{TEMP_LABELS[temperature] ?? temperature}</Badge>}
      {type && <Badge variant="outline">{TYPE_LABELS[type] ?? type}</Badge>}
      {score != null && <Badge variant="secondary">{score}/100</Badge>}
    </div>
  )
}
