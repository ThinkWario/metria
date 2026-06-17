import { fetchAPI } from './api'

// ── Types ──────────────────────────────────────────────────────────────────────

export type PaymentLinkStatus = 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED'

export interface PaymentLink {
  id: string
  workspaceId: string
  contactId: string | null
  dealId: string | null
  amount: string | number
  currency: string
  description: string | null
  provider: string
  externalId: string | null
  url: string | null
  status: PaymentLinkStatus
  createdAt: string
  paidAt: string | null
  contactName?: string | null
}

// createPaymentLink returns the link plus a needsConfig flag when MercadoPago
// is not configured (no real checkout URL was generated).
export interface CreatePaymentLinkResponse extends PaymentLink {
  needsConfig: boolean
}

export interface CreatePaymentLinkInput {
  contactId?: string | null
  dealId?: string | null
  amount: number
  currency?: string
  description?: string
}

// Lightweight contact shape used by the contact picker.
export interface ContactOption {
  id: string
  name: string
  email: string | null
  phone: string | null
}

// ── API functions ──────────────────────────────────────────────────────────────

export const listPaymentLinks = (): Promise<PaymentLink[]> =>
  fetchAPI('/crm/payment-links')

export const getPaymentLink = (id: string): Promise<PaymentLink> =>
  fetchAPI(`/crm/payment-links/${id}`)

export const createPaymentLink = (
  data: CreatePaymentLinkInput
): Promise<CreatePaymentLinkResponse> =>
  fetchAPI('/crm/payment-links', {
    method: 'POST',
    body: JSON.stringify(data)
  })

export const updatePaymentLinkStatus = (
  id: string,
  status: PaymentLinkStatus
): Promise<PaymentLink> =>
  fetchAPI(`/crm/payment-links/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status })
  })

// Reuses the existing CRM contacts search endpoint for the picker.
export const searchContacts = (search: string, limit = 8): Promise<ContactOption[]> =>
  fetchAPI(`/crm/contacts?search=${encodeURIComponent(search)}&limit=${limit}`)
