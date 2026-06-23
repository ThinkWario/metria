'use client'
import { useState, useEffect } from 'react'
import { fetchAPI } from '@/lib/api'
import { toast } from 'sonner'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

interface Product {
  id: string
  name: string
  description: string | null
  sku: string | null
  price: string
  currency: string
  isActive: boolean
  createdAt: string
}

interface ProductSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  product: Product | null
  onSaved: (product: Product) => void
}

export default function ProductSheet({ open, onOpenChange, product, onSaved }: ProductSheetProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [sku, setSku] = useState('')
  const [price, setPrice] = useState('')
  const [currency, setCurrency] = useState('CLP')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setName(product?.name ?? '')
      setDescription(product?.description ?? '')
      setSku(product?.sku ?? '')
      setPrice(product ? String(Number(product.price)) : '')
      setCurrency(product?.currency ?? 'CLP')
    }
  }, [open, product])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { toast.error('El nombre es requerido'); return }
    const priceNum = parseFloat(price)
    if (!price || isNaN(priceNum) || priceNum <= 0) { toast.error('El precio debe ser mayor a 0'); return }

    setSaving(true)
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        sku: sku.trim() || null,
        price: priceNum,
        currency
      }

      let saved: Product
      if (product) {
        saved = await fetchAPI(`/products/${product.id}`, {
          method: 'PUT',
          body: JSON.stringify(body)
        })
        toast.success('Producto actualizado')
      } else {
        saved = await fetchAPI('/products', {
          method: 'POST',
          body: JSON.stringify(body)
        })
        toast.success('Producto creado')
      }
      onSaved(saved)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar producto'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{product ? 'Editar Producto' : 'Nuevo Producto'}</SheetTitle>
          <SheetDescription>
            {product ? 'Modifica los datos del producto.' : 'Agrega un nuevo producto al catálogo.'}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="prod-name">Nombre *</Label>
            <Input
              id="prod-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Nombre del producto"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="prod-desc">Descripción</Label>
            <Textarea
              id="prod-desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Descripción opcional"
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="prod-sku">SKU</Label>
            <Input
              id="prod-sku"
              value={sku}
              onChange={e => setSku(e.target.value)}
              placeholder="SKU opcional"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="prod-price">Precio *</Label>
              <Input
                id="prod-price"
                type="number"
                min="0.01"
                step="0.01"
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="0"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prod-currency">Moneda</Label>
              <select
                id="prod-currency"
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
              >
                <option value="CLP">CLP</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>

          <SheetFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Guardando...' : product ? 'Guardar cambios' : 'Crear producto'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
