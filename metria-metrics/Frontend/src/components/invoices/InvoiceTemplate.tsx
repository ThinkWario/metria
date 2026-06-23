// InvoiceTemplate — pure React with inline styles only (for html2canvas compatibility)
import React from 'react'

interface LineItem {
  productId: string
  productName: string
  sku: string | null
  qty: number
  unitPrice: number
  subtotal: number
}

interface InvoiceData {
  number: string
  issuedAt: string
  currency: string
  subtotal: number
  taxRate: number
  total: number
  lineItems: LineItem[]
  contact: { name: string; email: string | null }
  workspace: { name: string }
}

interface InvoiceTemplateProps {
  invoice: InvoiceData
}

function fmt(n: number, currency: string) {
  if (currency === 'CLP') return '$' + Math.round(n).toLocaleString('es-CL')
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency }).format(n)
}

const InvoiceTemplate = React.forwardRef<HTMLDivElement, InvoiceTemplateProps>(
  ({ invoice }, ref) => {
    const taxAmount = invoice.subtotal * invoice.taxRate
    const taxPct = Math.round(invoice.taxRate * 100)

    return (
      <div
        ref={ref}
        style={{
          fontFamily: 'Arial, sans-serif',
          fontSize: '13px',
          color: '#111',
          background: '#fff',
          padding: '48px',
          width: '794px',
          minHeight: '1123px',
          boxSizing: 'border-box'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '40px' }}>
          <div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#4f46e5' }}>{invoice.workspace.name}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#111', letterSpacing: '-0.5px' }}>FACTURA</div>
            <div style={{ color: '#6b7280', marginTop: '4px' }}>{invoice.number}</div>
            <div style={{ color: '#6b7280', marginTop: '2px' }}>
              {new Date(invoice.issuedAt).toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
          </div>
        </div>

        {/* Bill to */}
        <div style={{ marginBottom: '32px' }}>
          <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
            Facturar a
          </div>
          <div style={{ fontWeight: 'bold', fontSize: '15px' }}>{invoice.contact.name}</div>
          {invoice.contact.email && <div style={{ color: '#6b7280', marginTop: '2px' }}>{invoice.contact.email}</div>}
        </div>

        {/* Line items table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
              <th style={{ textAlign: 'left', padding: '8px 0', fontSize: '11px', fontWeight: 'bold', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Producto</th>
              <th style={{ textAlign: 'right', padding: '8px 0', fontSize: '11px', fontWeight: 'bold', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', width: '60px' }}>Cant.</th>
              <th style={{ textAlign: 'right', padding: '8px 0', fontSize: '11px', fontWeight: 'bold', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', width: '120px' }}>P. Unit.</th>
              <th style={{ textAlign: 'right', padding: '8px 0', fontSize: '11px', fontWeight: 'bold', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', width: '120px' }}>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lineItems.map((item, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '10px 0' }}>
                  <div style={{ fontWeight: '500' }}>{item.productName}</div>
                  {item.sku && <div style={{ color: '#9ca3af', fontSize: '11px' }}>SKU: {item.sku}</div>}
                </td>
                <td style={{ textAlign: 'right', padding: '10px 0', color: '#374151' }}>{item.qty}</td>
                <td style={{ textAlign: 'right', padding: '10px 0', color: '#374151' }}>{fmt(item.unitPrice, invoice.currency)}</td>
                <td style={{ textAlign: 'right', padding: '10px 0', fontWeight: '500' }}>{fmt(item.subtotal, invoice.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '40px' }}>
          <div style={{ width: '240px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', color: '#6b7280' }}>
              <span>Subtotal</span>
              <span>{fmt(invoice.subtotal, invoice.currency)}</span>
            </div>
            {invoice.taxRate > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', color: '#6b7280' }}>
                <span>IVA ({taxPct}%)</span>
                <span>{fmt(taxAmount, invoice.currency)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', fontWeight: 'bold', fontSize: '16px', borderTop: '2px solid #111', marginTop: '4px' }}>
              <span>Total</span>
              <span>{fmt(invoice.total, invoice.currency)}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px', color: '#9ca3af', fontSize: '11px', textAlign: 'center' }}>
          {invoice.workspace.name} · Generado con Metria Metrics
        </div>
      </div>
    )
  }
)

InvoiceTemplate.displayName = 'InvoiceTemplate'

export default InvoiceTemplate
