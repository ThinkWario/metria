'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog'
import {
  Popover, PopoverContent, PopoverTrigger
} from '@/components/ui/popover'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  Check, ChevronsUpDown, Copy, ExternalLink, Loader2, User, X, AlertTriangle, Link2
} from 'lucide-react'
import { toast } from 'sonner'
import {
  createPaymentLink, searchContacts,
  type ContactOption, type CreatePaymentLinkResponse
} from '@/lib/payment-links-api'

const CURRENCIES = ['CLP', 'USD', 'ARS', 'MXN', 'COP', 'BRL', 'PEN'] as const

// ── Contact picker ──────────────────────────────────────────────────────────────

interface ContactPickerProps {
  selected: ContactOption | null
  onSelect: (contact: ContactOption | null) => void
}

function ContactPicker({ selected, onSelect }: ContactPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ContactOption[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const runSearch = useCallback(async (term: string) => {
    setLoading(true)
    try {
      const data = await searchContacts(term, 8)
      setResults(Array.isArray(data) ? data : [])
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Debounced search whenever the popover is open and the query changes.
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => runSearch(query), 300)
    return () => clearTimeout(t)
  }, [query, open, runSearch])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="flex items-center gap-2 truncate">
            <User className="h-4 w-4 text-muted-foreground shrink-0" />
            {selected ? (
              <span className="truncate">{selected.name}</span>
            ) : (
              <span className="text-muted-foreground">Buscar contacto (opcional)</span>
            )}
          </span>
          {selected ? (
            <X
              className="h-4 w-4 opacity-60 hover:opacity-100 shrink-0"
              onClick={(e) => { e.stopPropagation(); onSelect(null) }}
            />
          ) : (
            <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="p-2 border-b">
          <Input
            ref={inputRef}
            placeholder="Escribe un nombre, email o teléfono..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9"
          />
        </div>
        <div className="max-h-60 overflow-y-auto py-1">
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground justify-center">
              <Loader2 className="h-4 w-4 animate-spin" /> Buscando...
            </div>
          ) : results.length === 0 ? (
            <p className="px-3 py-6 text-sm text-muted-foreground text-center">
              {query ? 'Sin resultados' : 'Escribe para buscar contactos'}
            </p>
          ) : (
            results.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => { onSelect(c); setOpen(false) }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted/60 transition-colors"
              >
                <Check
                  className={`h-4 w-4 shrink-0 ${selected?.id === c.id ? 'opacity-100' : 'opacity-0'}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.name}</span>
                  {(c.email || c.phone) && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {c.email || c.phone}
                    </span>
                  )}
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ── Main dialog ─────────────────────────────────────────────────────────────────

interface PaymentLinkDialogProps {
  trigger: React.ReactNode
  defaultContact?: ContactOption | null
  onCreated: (link: CreatePaymentLinkResponse) => void
}

export function PaymentLinkDialog({ trigger, defaultContact, onCreated }: PaymentLinkDialogProps) {
  const [open, setOpen] = useState(false)
  const [contact, setContact] = useState<ContactOption | null>(defaultContact ?? null)
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('CLP')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  // Result state — when a link is generated we swap the form for a success view.
  const [result, setResult] = useState<CreatePaymentLinkResponse | null>(null)
  const [copied, setCopied] = useState(false)

  // Reset on open.
  useEffect(() => {
    if (open) {
      setContact(defaultContact ?? null)
      setAmount('')
      setCurrency('CLP')
      setDescription('')
      setResult(null)
      setCopied(false)
    }
  }, [open, defaultContact])

  async function handleCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success('Link copiado al portapapeles')
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error('No se pudo copiar el link')
    }
  }

  async function handleSubmit() {
    const amountNum = Number(amount)
    if (!isFinite(amountNum) || amountNum <= 0) {
      toast.error('Ingresa un monto válido mayor a 0')
      return
    }

    setSaving(true)
    try {
      const link = await createPaymentLink({
        contactId: contact?.id ?? null,
        amount: amountNum,
        currency,
        description: description.trim() || undefined
      })
      onCreated(link)

      if (link.needsConfig || !link.url) {
        // Row was created but no real checkout URL — surface the config note.
        toast.info('Cobro creado en estado pendiente')
      } else {
        toast.success('Link de cobro generado')
      }
      setResult(link)
    } catch (err: any) {
      toast.error(err?.message ?? 'Error al crear el cobro')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <span onClick={() => setOpen(true)} className="cursor-pointer">
        {trigger}
      </span>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{result ? 'Cobro creado' : 'Nuevo cobro'}</DialogTitle>
            <DialogDescription>
              {result
                ? 'Comparte este link con tu cliente para que realice el pago.'
                : 'Genera un link de pago con MercadoPago y compártelo con un contacto.'}
            </DialogDescription>
          </DialogHeader>

          {!result ? (
            <>
              <div className="space-y-4 py-2">
                {/* Contact */}
                <div className="space-y-1.5">
                  <Label>Contacto</Label>
                  <ContactPicker selected={contact} onSelect={setContact} />
                </div>

                {/* Amount + currency */}
                <div className="space-y-1.5">
                  <Label htmlFor="pl-amount">Monto *</Label>
                  <div className="flex gap-2">
                    <Input
                      id="pl-amount"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      placeholder="0"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="flex-1"
                    />
                    <Select value={currency} onValueChange={setCurrency}>
                      <SelectTrigger className="w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <Label htmlFor="pl-desc">Concepto</Label>
                  <Textarea
                    id="pl-desc"
                    placeholder="ej. Anticipo instalación paneles solares"
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                  Cancelar
                </Button>
                <Button onClick={handleSubmit} disabled={saving}>
                  {saving ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generando...</>
                  ) : (
                    <><Link2 className="h-4 w-4 mr-2" /> Generar link</>
                  )}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="space-y-4 py-2">
                <Separator />

                {result.needsConfig || !result.url ? (
                  <div className="flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                    <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                    <div className="space-y-1 text-sm">
                      <p className="font-medium text-amber-700 dark:text-amber-400">
                        MercadoPago no está configurado
                      </p>
                      <p className="text-muted-foreground">
                        Configura tu token de MercadoPago para generar links reales. El cobro
                        quedó registrado como pendiente y podrás generar su link una vez conectado.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Link de pago</Label>
                    <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-2">
                      <code className="flex-1 truncate text-xs px-1">{result.url}</code>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => handleCopy(result.url!)}
                        className="shrink-0"
                      >
                        {copied ? (
                          <><Check className="h-3.5 w-3.5 mr-1.5" /> Copiado</>
                        ) : (
                          <><Copy className="h-3.5 w-3.5 mr-1.5" /> Copiar</>
                        )}
                      </Button>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      asChild
                    >
                      <a href={result.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Abrir checkout
                      </a>
                    </Button>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button onClick={() => setOpen(false)}>Listo</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
