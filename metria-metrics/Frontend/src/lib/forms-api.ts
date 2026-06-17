import { fetchAPI } from './api'

// ── Types ──────────────────────────────────────────────────────────────────────

export type FormFieldType = 'text' | 'email' | 'tel' | 'textarea' | 'select'

/**
 * `fields` JSON shape — mirrors the backend (forms.service.ts):
 *   { id, label, type, required, options? }
 * `options` is only present (and required) when type === 'select'.
 */
export interface FormField {
  id: string
  label: string
  type: FormFieldType
  required: boolean
  options?: string[]
}

export interface Form {
  id: string
  workspaceId: string
  name: string
  description: string | null
  fields: FormField[]
  slug: string
  isActive: boolean
  submitButtonText: string
  successMessage: string
  submissionCount: number
  createdAt: string
  updatedAt: string
}

export interface CreateFormInput {
  name: string
  description?: string
  fields: FormField[]
  isActive?: boolean
  submitButtonText?: string
  successMessage?: string
}

export interface UpdateFormInput {
  name?: string
  description?: string | null
  fields?: FormField[]
  isActive?: boolean
  submitButtonText?: string
  successMessage?: string
}

// ── API functions ──────────────────────────────────────────────────────────────

export const listForms = (): Promise<Form[]> =>
  fetchAPI('/crm/forms')

export const getForm = (id: string): Promise<Form> =>
  fetchAPI(`/crm/forms/${id}`)

export const createForm = (data: CreateFormInput): Promise<Form> =>
  fetchAPI('/crm/forms', {
    method: 'POST',
    body: JSON.stringify(data)
  })

export const updateForm = (id: string, data: UpdateFormInput): Promise<Form> =>
  fetchAPI(`/crm/forms/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  })

export const deleteForm = (id: string): Promise<void> =>
  fetchAPI(`/crm/forms/${id}`, { method: 'DELETE' })
