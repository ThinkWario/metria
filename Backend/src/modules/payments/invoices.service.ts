import { prisma } from '../../lib/prisma'

interface InvoiceLineItemInput {
  productId: string
  qty: number
  unitPrice?: number
}

interface CreateInvoiceData {
  contactId: string
  dealId?: string
  lineItems: InvoiceLineItemInput[]
  taxRate?: number
  currency?: string
}

export async function createInvoice(workspaceId: string, data: CreateInvoiceData) {
  // Validate line items
  const lineItems = data.lineItems
  if (!lineItems || lineItems.length === 0) {
    throw new Error('Al menos un producto requerido')
  }
  for (const li of lineItems) {
    if (!li.qty || li.qty <= 0 || !Number.isInteger(li.qty)) {
      throw new Error('qty debe ser entero positivo')
    }
    if (li.unitPrice != null && li.unitPrice < 0) {
      throw new Error('unitPrice debe ser >= 0')
    }
  }
  if (data.taxRate != null && (data.taxRate < 0 || data.taxRate > 1)) {
    throw new Error('taxRate debe estar entre 0 y 1')
  }

  // Validate contact belongs to workspace
  const contact = await prisma.contact.findFirst({
    where: { id: data.contactId, workspaceId }
  })
  if (!contact) throw new Error('Contacto no encontrado')

  // Validate products
  const productIds = data.lineItems.map(li => li.productId)
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, workspaceId, isActive: true }
  })
  if (products.length !== productIds.length) {
    throw new Error('Uno o más productos no encontrados o inactivos')
  }

  const productMap = new Map(products.map(p => [p.id, p]))

  // Build enriched line items
  const enrichedLineItems = data.lineItems.map(li => {
    const product = productMap.get(li.productId)!
    const unitPrice = li.unitPrice !== undefined ? li.unitPrice : Number(product.price)
    const subtotal = unitPrice * li.qty
    return {
      productId: li.productId,
      productName: product.name,
      sku: product.sku ?? null,
      qty: li.qty,
      unitPrice,
      subtotal
    }
  })

  // Compute totals
  const subtotal = enrichedLineItems.reduce((sum, li) => sum + li.subtotal, 0)
  const taxRate = data.taxRate ?? 0
  const total = subtotal * (1 + taxRate)

  // Auto-number + create atomically to avoid duplicate invoice numbers under
  // concurrent requests within the same workspace.
  const invoice = await prisma.$transaction(async (tx) => {
    const lastInvoice = await tx.invoice.findFirst({
      where: { workspaceId },
      orderBy: { number: 'desc' },
      select: { number: true }
    })
    const lastNum = lastInvoice ? parseInt(lastInvoice.number.replace(/\D/g, ''), 10) || 0 : 0
    const nextNum = lastNum + 1
    const number = `INV-${String(nextNum).padStart(4, '0')}`

    return tx.invoice.create({
      data: {
        workspaceId,
        contactId: data.contactId,
        dealId: data.dealId ?? null,
        number,
        lineItems: enrichedLineItems,
        subtotal,
        taxRate,
        total,
        currency: data.currency ?? 'CLP'
      },
      include: {
        contact: { select: { id: true, name: true, email: true } },
        workspace: { select: { id: true, name: true } }
      }
    })
  })

  return invoice
}

export async function listInvoices(workspaceId: string) {
  return prisma.invoice.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    include: {
      contact: { select: { id: true, name: true, email: true } }
    }
  })
}
