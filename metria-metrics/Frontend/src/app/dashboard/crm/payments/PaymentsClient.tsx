'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  CreditCard, Plus, Copy, Check, ExternalLink, User, AlertCircle, RefreshCw, KanbanSquare
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { PaymentLinkDialog } from '@/components/crm/PaymentLinkDialog'
import {
  listPaymentLinks, type PaymentLink, type PaymentLinkStatus
} from '@/lib/payment-links-api'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

// ── Status presentation ──────────────────────────────────────────────────────────

const STATUS_META: Record<PaymentLinkStatus, { label: string; className: string }> = {
  PENDING:   { label: 'Pendiente', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
  PAID:      { label: 'Pagado',    className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
  EXPIRED:   { label: 'Expirado',  className: 'bg-muted text-muted-foreground border-border' },
  CANCELLED: { label: 'Cancelado', className: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20' }
}

function formatAmount(amount: string | number, currency: string) {
  const value = typeof amount === 'string' ? Number(amount) : amount
  if (!isFinite(value)) return `${amount} ${currency}`
  try {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency,
      maximumFractionDigits: currency === 'CLP' ? 0 : 2
    }).format(value)
  } catch {
    return `${value} ${currency}`
  }
}

// ── Row ──────────────────────────────────────────────────────────────────────────

function PaymentLinkRow({ link }: { link: PaymentLink }) {
  const [copied, setCopied] = useState(false)
  const meta = STATUS_META[link.status] ?? STATUS_META.PENDING

  async function copyUrl() {
    if (!link.url) return
    try {
      await navigator.clipboard.writeText(link.url)
      setCopied(true)
      toast.success('Link copiado al portapapeles')
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error('No se pudo copiar el link')
    }
  }

  return (
    <Card className="transition-colors hover:border-primary/30">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: amount + meta */}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold tabular-nums">
              {formatAmount(link.amount, link.currency)}
            </span>
            <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
            {link.contactName && (
              <span className="flex items-center gap-1 truncate">
                <User className="h-3.5 w-3.5 shrink-0" />
                {link.contactName}
              </span>
            )}
            {link.dealTitle && (
              <Link
                href="/dashboard/crm/pipelines"
                className="flex items-center gap-1 text-primary/70 hover:text-primary transition-colors truncate"
              >
                <KanbanSquare className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{link.dealTitle}</span>
              </Link>
            )}
            {link.description && (
              <span className="truncate">{link.description}</span>
            )}
            <span className="text-xs">
              {link.status === 'PAID' && link.paidAt
                ? `Pagado ${formatDistanceToNow(new Date(link.paidAt), { addSuffix: true, locale: es })}`
                : `Creado ${formatDistanceToNow(new Date(link.createdAt), { addSuffix: true, locale: es })}`}
            </span>
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-2 shrink-0">
          {link.url ? (
            <>
              <Button variant="secondary" size="sm" onClick={copyUrl}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                <span className="ml-1.5 hidden sm:inline">{copied ? 'Copiado' : 'Copiar'}</span>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={link.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span className="ml-1.5 hidden sm:inline">Abrir</span>
                </a>
              </Button>
            </>
          ) : (
            <Badge variant="outline" className="gap-1 text-muted-foreground">
              <AlertCircle className="h-3 w-3" /> Sin link
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ── Main client ──────────────────────────────────────────────────────────────────

export default function PaymentsClient() {
  const [mounted, setMounted] = useState(false)
  const [links, setLinks] = useState<PaymentLink[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    fetchLinks()
  }, [mounted])

  async function fetchLinks() {
    setLoading(true)
    setError(false)
    try {
      const data = await listPaymentLinks()
      setLinks(Array.isArray(data) ? data : [])
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  function handleCreated(link: PaymentLink) {
    // Optimistic: prepend the new link so it appears instantly.
    setLinks((prev) => [link, ...prev])
  }

  const newButton = (
    <PaymentLinkDialog
      trigger={
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo cobro
        </Button>
      }
      onCreated={handleCreated}
    />
  )

  // Loading
  if (!mounted || loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-48" />
              </div>
              <Skeleton className="h-8 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  // Error
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20 gap-4 text-center">
        <div className="rounded-full bg-destructive/10 p-4">
          <AlertCircle className="h-8 w-8 text-destructive" />
        </div>
        <div>
          <p className="font-medium">No pudimos cargar los cobros</p>
          <p className="text-sm text-muted-foreground mt-1">Revisa tu conexión e inténtalo de nuevo.</p>
        </div>
        <Button variant="outline" onClick={fetchLinks}>
          <RefreshCw className="h-4 w-4 mr-2" /> Reintentar
        </Button>
      </div>
    )
  }

  return (
    <>
      <div className="flex justify-end">{newButton}</div>

      {links.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-20 gap-4 text-center">
          <div className="rounded-full bg-muted p-4">
            <CreditCard className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">Aún no hay cobros</p>
            <p className="text-sm text-muted-foreground mt-1">
              Genera tu primer link de pago y compártelo con un contacto.
            </p>
          </div>
          <PaymentLinkDialog
            trigger={<Button variant="outline">Crear primer cobro</Button>}
            onCreated={handleCreated}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {links.map((link) => (
            <PaymentLinkRow key={link.id} link={link} />
          ))}
        </div>
      )}
    </>
  )
}
