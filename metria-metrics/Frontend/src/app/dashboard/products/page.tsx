import type { Metadata } from 'next'
import ProductsClient from './ProductsClient'

export const metadata: Metadata = {
  title: 'Catálogo de Productos | Metria',
  description: 'Gestiona tu catálogo de productos para facturación y ventas'
}

export default function ProductsPage() {
  return <ProductsClient />
}
