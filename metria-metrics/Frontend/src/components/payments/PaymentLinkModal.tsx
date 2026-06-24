'use client'

import { useState, useEffect, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CreditCard, Copy, Check, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { fetchAPI } from '@/lib/api'

interface PaymentLinkModalProps {
  open: boolean
  onClose: () => void
  deal: { id: string; value: number | null; title: string; contactId: string }
  contactName?: string
}

export function PaymentLinkModal({ open, onClose, deal, contactName }: PaymentLinkModalProps) {
  const [amount, setAmount] = useState<string>(deal.value != null ? String(deal.value) : '')
  const [description, setDescription] = useState(deal.title)
  const [creating, setCreating] = useState(false)
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [sendingWa, setSendingWa] = useState(false)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
  }, [])

  function handleClose() {
    setPaymentUrl(null)
    setCopied(false)
    setAmount(deal.value != null ? String(deal.value) : '')
    setDescription(deal.title)
    onClose()
  }

  async function handleCreate() {
    const amountNum = parseFloat(amount)
    if (!isFinite(amountNum) || amountNum <= 0) {
      toast.error('El monto debe ser mayor a 0')
      return
    }
    setCreating(true)
    try {
      const result = await fetchAPI('/crm/payment-links', {
        method: 'POST',
        body: JSON.stringify({
          amount: amountNum,
          description: description.trim() || undefined,
          contactId: deal.contactId,
          dealId: deal.id,
          currency: 'CLP'
        })
      })
      if (result.needsConfig) {
        toast.warning('Link creado, pero MercadoPago no está configurado. Configura tu access token para generar links reales.')
      }
      setPaymentUrl(result.url ?? null)
      toast.success('Link de pago creado')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al crear link de pago'
      toast.error(msg)
    } finally {
      setCreating(false)
    }
  }

  async function handleCopy() {
    if (!paymentUrl) return
    try {
      await navigator.clipboard.writeText(paymentUrl)
      setCopied(true)
      toast.success('Link copiado al portapapeles')
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  async function handleSendWhatsApp() {
    if (!paymentUrl) return
    setSendingWa(true)
    const text = `Hola${contactName ? ` ${contactName}` : ''}, te comparto el link de pago: ${paymentUrl}`
    try {
      // Look up the contact's conversation and send through the messaging API.
      const convs = await fetchAPI(`/messaging/conversations?contactId=${deal.contactId}&limit=1`)
      const conv = Array.isArray(convs) ? convs[0] : convs?.conversations?.[0]
      if (conv?.id) {
        await fetchAPI(`/messaging/conversations/${conv.id}/messages`, {
          method: 'POST',
          body: JSON.stringify({ content: text, type: 'TEXT' })
        })
        toast.success('Link enviado por WhatsApp')
      } else {
        // No active conversation: open WhatsApp share with the message prefilled.
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank')
        toast.info('No se encontró conversación activa. Selecciona el contacto en WhatsApp para enviar.')
      }
    } catch {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank')
      toast.info('Redirigiendo a WhatsApp')
    } finally {
      setSendingWa(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose() }}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Crear Link de Cobro
          </DialogTitle>
        </DialogHeader>

        {!paymentUrl ? (
          <>
            <div className="space-y-4 py-1">
              {contactName && (
                <p className="text-sm text-muted-foreground">
                  Contacto: <span className="font-medium text-foreground">{contactName}</span>
                </p>
              )}
              <div className="space-y-1.5">
                <Label>Monto (CLP)</Label>
                <Input
                  type="number"
                  placeholder="Ej. 150000"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label>Descripción</Label>
                <Input
                  placeholder="Descripción del cobro"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancelar</Button>
              <Button
                onClick={handleCreate}
                disabled={creating || !amount || parseFloat(amount) <= 0}
              >
                {creating ? 'Creando...' : 'Crear Link'}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="space-y-4 py-1">
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Link de pago</p>
                <p className="text-sm break-all font-mono">{paymentUrl}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  className="flex-1 gap-2"
                  variant="outline"
                  onClick={handleCopy}
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copiado' : 'Copiar link'}
                </Button>
                <Button
                  className="flex-1 gap-2"
                  onClick={handleSendWhatsApp}
                  disabled={sendingWa}
                >
                  <MessageCircle className="h-4 w-4" />
                  {sendingWa ? 'Enviando...' : 'Enviar por WhatsApp'}
                </Button>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cerrar</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
