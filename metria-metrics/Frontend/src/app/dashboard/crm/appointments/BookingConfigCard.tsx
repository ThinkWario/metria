'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchAPI } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Link2, Copy, Check, Loader2, ExternalLink, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

interface BookingConfig {
  bookingSlug: string | null
  bookingTitle: string | null
  bookingDurationMin: number
}

const DURATIONS = [15, 30, 45, 60, 90, 120]

/** Mirror of the backend slugify so the preview URL matches what gets saved. */
function slugifyPreview(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

export function BookingConfigCard() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const [slug, setSlug] = useState('')
  const [title, setTitle] = useState('')
  const [duration, setDuration] = useState(30)

  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [savedSlug, setSavedSlug] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true); setError(null)
    fetchAPI('/scheduling/booking-config')
      .then((data: BookingConfig) => {
        if (!active) return
        setSlug(data.bookingSlug ?? '')
        setSavedSlug(data.bookingSlug ?? null)
        setTitle(data.bookingTitle ?? '')
        setDuration(data.bookingDurationMin ?? 30)
      })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : 'Error al cargar la configuración') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [reloadKey])

  const previewSlug = slugifyPreview(slug)
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const publicUrl = previewSlug ? `${origin}/book/${previewSlug}` : ''
  // The shareable URL only "exists" once the current slug is saved
  const liveUrl = savedSlug ? `${origin}/book/${savedSlug}` : ''

  const handleSave = useCallback(async () => {
    if (!previewSlug) {
      toast.error('Define un enlace para tu página de reservas')
      return
    }
    setSaving(true)
    try {
      const saved: BookingConfig = await fetchAPI('/scheduling/booking-config', {
        method: 'PATCH',
        body: JSON.stringify({
          bookingSlug: slug,
          bookingTitle: title.trim() || null,
          bookingDurationMin: duration,
        }),
      })
      setSlug(saved.bookingSlug ?? '')
      setSavedSlug(saved.bookingSlug ?? null)
      setTitle(saved.bookingTitle ?? '')
      setDuration(saved.bookingDurationMin ?? 30)
      toast.success('Configuración de reservas guardada')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo guardar'
      if (/slug en uso/i.test(msg)) {
        toast.error('Ese enlace ya está en uso. Prueba con otro.')
      } else {
        toast.error(msg)
      }
    } finally {
      setSaving(false)
    }
  }, [slug, title, duration, previewSlug])

  const handleCopy = useCallback(async () => {
    if (!liveUrl) return
    try {
      await navigator.clipboard.writeText(liveUrl)
      setCopied(true)
      toast.success('Enlace copiado')
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error('No se pudo copiar el enlace')
    }
  }, [liveUrl])

  if (loading) {
    return (
      <Card className="border-border/40 bg-card/50 backdrop-blur-sm rounded-2xl">
        <CardContent className="p-5 space-y-4">
          <Skeleton className="h-5 w-56" />
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
          <Skeleton className="h-10 w-full rounded-xl" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="border-border/40 bg-card/50 backdrop-blur-sm rounded-2xl">
        <CardContent className="p-5 flex flex-col items-center text-center gap-2 py-8">
          <div className="w-11 h-11 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <p className="font-bold text-foreground">No pudimos cargar la configuración</p>
          <p className="text-sm text-muted-foreground max-w-xs">{error}</p>
          <Button variant="outline" size="sm" className="rounded-xl mt-1" onClick={() => setReloadKey(k => k + 1)}>
            Reintentar
          </Button>
        </CardContent>
      </Card>
    )
  }

  const slugUnsaved = previewSlug !== (savedSlug ?? '')

  return (
    <Card className="border-border/40 bg-card/50 backdrop-blur-sm rounded-2xl overflow-hidden">
      <CardContent className="p-5 space-y-5">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
            <Link2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-bold text-foreground leading-tight">Configuración de reservas</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Comparte un enlace para que tus clientes reserven citas por su cuenta.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="booking-slug" className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Enlace
            </Label>
            <div className="flex items-center rounded-xl border border-border bg-background/50 overflow-hidden focus-within:ring-2 focus-within:ring-primary/40">
              <span className="pl-3 pr-1 text-xs text-muted-foreground whitespace-nowrap select-none">/book/</span>
              <Input
                id="booking-slug"
                value={slug}
                onChange={e => setSlug(e.target.value)}
                placeholder="mi-negocio"
                className="border-0 bg-transparent rounded-none focus-visible:ring-0 px-1"
              />
            </div>
            {previewSlug && previewSlug !== slug.toLowerCase() && (
              <p className="text-[11px] text-muted-foreground">Se guardará como <span className="font-mono">{previewSlug}</span></p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="booking-duration" className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Duración por cita
            </Label>
            <Select value={String(duration)} onValueChange={v => setDuration(Number(v))}>
              <SelectTrigger id="booking-duration" className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATIONS.map(d => (
                  <SelectItem key={d} value={String(d)}>{d} minutos</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="booking-title" className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Título de la página
          </Label>
          <Input
            id="booking-title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Agenda una visita técnica"
            className="rounded-xl"
            maxLength={120}
          />
        </div>

        {/* Public URL + copy */}
        <div className="space-y-2 pt-1">
          <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">URL pública</Label>
          {liveUrl ? (
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2.5 min-w-0">
                <Link2 className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-mono text-foreground truncate">{liveUrl}</span>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="rounded-xl gap-2" onClick={handleCopy}>
                  {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copiado' : 'Copiar'}
                </Button>
                <Button type="button" variant="ghost" size="icon" className="rounded-xl shrink-0" asChild>
                  <a href={liveUrl} target="_blank" rel="noopener noreferrer" aria-label="Abrir página de reservas">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground rounded-xl border border-dashed border-border px-3 py-3">
              Guarda tu enlace para obtener una URL pública que compartir.
            </p>
          )}
          {liveUrl && slugUnsaved && (
            <p className="text-[11px] text-amber-500">
              Tienes cambios sin guardar en el enlace. La URL pública se actualizará al guardar.
            </p>
          )}
        </div>

        <div className="flex justify-end pt-1">
          <Button onClick={handleSave} disabled={saving} className="rounded-xl gap-2 min-w-[140px]">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando…</> : 'Guardar cambios'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
