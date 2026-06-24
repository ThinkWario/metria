'use client'
import { useState, useEffect, useCallback } from 'react'
import { fetchAPI } from '@/lib/api'
import { toast } from 'sonner'
import { Plus, Pencil, PowerOff, Package } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog'
import ProductSheet from '@/components/products/ProductSheet'

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

function formatPrice(price: string, currency: string) {
  const n = Number(price)
  if (currency === 'CLP') {
    return '$' + Math.round(n).toLocaleString('es-CL')
  }
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency }).format(n)
}

export default function ProductsClient() {
  const [mounted, setMounted] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [deactivateTarget, setDeactivateTarget] = useState<Product | null>(null)

  useEffect(() => { setMounted(true) }, [])

  const loadProducts = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchAPI('/products')
      setProducts(data)
    } catch {
      toast.error('Error al cargar productos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!mounted) return
    loadProducts()
  }, [mounted, loadProducts])

  function openCreate() {
    setEditProduct(null)
    setSheetOpen(true)
  }

  function openEdit(product: Product) {
    setEditProduct(product)
    setSheetOpen(true)
  }

  async function handleDeactivate(product: Product) {
    try {
      await fetchAPI(`/products/${product.id}`, { method: 'DELETE' })
      setProducts(prev => prev.filter(p => p.id !== product.id))
      toast.success(`"${product.name}" desactivado`)
    } catch {
      toast.error('Error al desactivar producto')
    }
  }

  function handleSaved(product: Product) {
    setProducts(prev => {
      const idx = prev.findIndex(p => p.id === product.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = product
        return next
      }
      return [product, ...prev]
    })
    setSheetOpen(false)
  }

  if (!mounted || loading) {
    return (
      <div className="space-y-4 animate-pulse p-6">
        <div className="h-8 w-48 bg-muted/40 rounded" />
        <div className="h-64 bg-muted/40 rounded-lg" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Catálogo de Productos</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gestiona los productos para facturación</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Nuevo Producto
        </Button>
      </div>

      {products.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center space-y-3">
          <Package className="h-10 w-10 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground text-sm">Sin productos en el catálogo</p>
          <Button variant="outline" onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Agregar primer producto
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nombre</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">SKU</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Precio</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {products.map(product => (
                <tr key={product.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium">{product.name}</div>
                    {product.description && (
                      <div className="text-xs text-muted-foreground truncate max-w-xs">{product.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                    {product.sku ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {formatPrice(product.price, product.currency)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={product.isActive ? 'default' : 'secondary'}>
                      {product.isActive ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(product)}
                        className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                        aria-label="Editar"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setDeactivateTarget(product)}
                        className="p-1.5 rounded hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                        aria-label="Desactivar"
                      >
                        <PowerOff className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ProductSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        product={editProduct}
        onSaved={handleSaved}
      />

      <AlertDialog open={!!deactivateTarget} onOpenChange={open => !open && setDeactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desactivar producto?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deactivateTarget?.name}</strong> no aparecerá en nuevas facturas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deactivateTarget) handleDeactivate(deactivateTarget)
                setDeactivateTarget(null)
              }}
            >
              Desactivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
