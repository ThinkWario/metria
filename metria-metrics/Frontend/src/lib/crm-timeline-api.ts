import { fetchAPI } from './api'

export interface ContactEvent {
  id: string
  contactId: string
  type: string
  title: string
  description?: string
  metadata?: any
  createdAt: string
}

export interface ContactTask {
  id: string
  contactId: string
  title: string
  description?: string
  dueAt?: string
  completedAt?: string
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  createdAt: string
}

export const getContactEvents = (contactId: string): Promise<ContactEvent[]> =>
  fetchAPI(`/crm/contacts/${contactId}/events`)

export const getContactTasks = (contactId: string): Promise<ContactTask[]> =>
  fetchAPI(`/crm/contacts/${contactId}/tasks`)

export const createContactTask = (
  contactId: string,
  data: { title: string; description?: string; dueAt?: string; priority?: string }
): Promise<ContactTask> =>
  fetchAPI(`/crm/contacts/${contactId}/tasks`, {
    method: 'POST',
    body: JSON.stringify(data)
  })

export const updateContactTask = (
  taskId: string,
  data: Partial<{
    title: string
    description: string
    dueAt: string | null
    priority: string
    completedAt: string | null
  }>
): Promise<ContactTask> =>
  fetchAPI(`/crm/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  })

export const deleteContactTask = (taskId: string): Promise<void> =>
  fetchAPI(`/crm/tasks/${taskId}`, { method: 'DELETE' })
