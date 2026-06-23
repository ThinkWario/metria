'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { fetchAPI } from '@/lib/api'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Plus, Trash2, FileText } from 'lucide-react'
import InvoiceTemplate from './InvoiceTemplate'

interface Product {
  id: string
  name: string
  sku: string | null
  price: string
  currency: string
}

interface LineItem {
  productId: string
  qty: number
  unitPrice: number
}

interface InvoiceModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contactId: string
  dealId?: string
}

export default function InvoiceModal({ open, onOpenChange, contactId, dealId }: InvoiceModalProps) {
  const [products, setProducts] = useState<Product[]>([])
  const [lineItems, setLineItems] = useState<LineItem[]>([{ productId: '', qty: 1, unitPrice: 0 }])
  const [taxRate, setTaxRate] = useState(0)
  const [loading, setLoading] = useState(false)
  const [generatedInvoice, setGeneratedInvoice] = useState<any>(null)
  const invoiceRef = useRef<HTMLDivElement>(null)

  const loadProducts = useCallback(async () => {
    try {
      const data = await fetchAPI('/products')
      setProducts(data)
    } catch {
      // silently ignore — user sees empty dropdown
    }
  }, [])

  useEffect(() => {
    if (open) {
      loadProducts()
      setLineItems([{ productId: '', qty: 1, unitPrice: 0 }])
      setTaxRate(0)
      setGeneratedInvoice(null)
    }
  }, [open, loadProducts])

  function addLine() {
    setLineItems(prev => [...prev, { productId: '', qty: 1, unitPrice: 0 }])
  }

  function removeLine(idx: number) {
    setLineItems(prev => prev.filter((_, i) => i !== idx))
  }

  function updateLine(idx: number, field: keyof LineItem, value: string | number) {
    setLineItems(prev => {
      const next = [...prev]
      if (field === 'productId') {
        const product = products.find(p => p.id === value)
        next[idx] = { ...next[idx], productId: value as string, unitPrice: product ? Number(product.price) : 0 }
      } else {
        next[idx] = { ...next[idx], [field]: Number(value) }
      }
      return next
    })
  }

  async function handleGenerate() {
    const validLines = lineItems.filter(li => li.productId && li.qty > 0)
    if (validLines.length === 0) { toast.error('Agrega al menos un producto'); return }

    setLoading(true)
    try {
      const invoice = await fetchAPI('/invoices', {
        method: 'POST',
        body: JSON.stringify({
          contactId,
          dealId: dealId ?? undefined,
          lineItems: validLines.map(li => ({
            productId: li.productId,
            qty: li.qty,
            unitPrice: li.unitPrice || undefined
          })),
          taxRate
        })
      })
      setGeneratedInvoice(invoice)

      // Generate PDF after rendering the invoice template
      // The hidden div with ref will be populated in the next render cycle
      setTimeout(async () => {
        if (!invoiceRef.current) return
        try {
          const html2canvas = (await import('html2canvas')).default
          const jsPDF = (await import('jspdf')).default

          const canvas = await html2canvas(invoiceRef.current, { scale: 2, useCORS: true })
          const imgData = canvas.toDataURL('image/png')
          const pdf = new jsPDF('p', 'mm', 'a4')
          const pdfW = pdf.internal.pageSize.getWidth()
          const pdfH = (canvas.height * pdfW) / canvas.width
          pdf.addImage(imgData, 'PNG', 0, 0, pdfW, pdfH)
          pdf.save(`${invoice.number}.pdf`)
          toast.success(`Factura ${invoice.number} generada`)
          onOpenChange(false)
        } catch (pdfErr) {
          console.error(pdfErr)
          toast.error('Error al generar el PDF')
        }
      }, 300)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al crear factura'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Generar Factura
            </DialogTitle>
            <DialogDescription>
              Selecciona los productos para incluir en la factura.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Line items */}
            <div className="space-y-2">
              <Label>Productos</Label>
              {lineItems.map((line, idx) => (
                <div key={idx} className="flex gap-2 items-end">
                  <div className="flex-1">
                    <select
                      value={line.productId}
                      onChange={e => updateLine(idx, 'productId', e.target.value)}
                      className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                    >
                      <option value="">Seleccionar producto</option>
                      {products.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name}{p.sku ? ` (${p.sku})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-20">
                    <Input
                      type="number"
                      min={1}
                      value={line.qty}
                      onChange={e => updateLine(idx, 'qty', e.target.value)}
                      placeholder="Cant."
                    />
                  </div>
                  <div className="w-28">
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={line.unitPrice || ''}
                      onChange={e => updateLine(idx, 'unitPrice', e.target.value)}
                      placeholder="Precio"
                    />
                  </div>
                  {lineItems.length > 1 && (
                    <button
                      onClick={() => removeLine(idx)}
                      className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addLine} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Agregar línea
              </Button>
            </div>

            {/* Tax rate */}
            <div className="flex items-center gap-3">
              <Label htmlFor="inv-tax" className="shrink-0">IVA (%)</Label>
              <Input
                id="inv-tax"
                type="number"
                min={0}
                max={100}
                step={1}
                value={Math.round(taxRate * 100)}
                onChange={e => setTaxRate(Number(e.target.value) / 100)}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">0 = sin IVA, 19 = IVA Chile</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleGenerate} disabled={loading} className="gap-2">
              <FileText className="h-4 w-4" />
              {loading ? 'Generando...' : 'Generar PDF'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hidden invoice template for html2canvas rendering */}
      {generatedInvoice && (
        <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
          <InvoiceTemplate ref={invoiceRef} invoice={generatedInvoice} />
        </div>
      )}
    </>
  )
}
