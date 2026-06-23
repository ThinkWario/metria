import { prisma } from '../../lib/prisma'

export async function listProducts(workspaceId: string) {
  return prisma.product.findMany({
    where: { workspaceId, isActive: true },
    orderBy: { createdAt: 'desc' }
  })
}

export async function createProduct(
  workspaceId: string,
  data: { name: string; description?: string; sku?: string; price: number; currency?: string }
) {
  if (!data.name?.trim()) throw new Error('El nombre es requerido')
  if (!data.price || data.price <= 0) throw new Error('El precio debe ser mayor a 0')

  return prisma.product.create({
    data: {
      workspaceId,
      name: data.name.trim(),
      description: data.description?.trim() || null,
      sku: data.sku?.trim() || null,
      price: data.price,
      currency: data.currency ?? 'CLP',
      isActive: true
    }
  })
}

export async function updateProduct(
  workspaceId: string,
  id: string,
  data: { name?: string; description?: string; sku?: string; price?: number; currency?: string }
) {
  const existing = await prisma.product.findFirst({ where: { id, workspaceId } })
  if (!existing) throw new Error('Producto no encontrado')

  if (data.name !== undefined && !data.name.trim()) throw new Error('El nombre no puede estar vacío')
  if (data.price !== undefined && data.price <= 0) throw new Error('El precio debe ser mayor a 0')

  return prisma.product.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.description !== undefined && { description: data.description?.trim() || null }),
      ...(data.sku !== undefined && { sku: data.sku?.trim() || null }),
      ...(data.price !== undefined && { price: data.price }),
      ...(data.currency !== undefined && { currency: data.currency })
    }
  })
}

export async function deleteProduct(workspaceId: string, id: string) {
  const existing = await prisma.product.findFirst({ where: { id, workspaceId } })
  if (!existing) throw new Error('Producto no encontrado')

  return prisma.product.update({ where: { id }, data: { isActive: false } })
}
