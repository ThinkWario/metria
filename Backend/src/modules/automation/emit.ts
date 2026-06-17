import type { ContactEventType } from '@prisma/client'
import { createContactEvent } from '../crm/contactEvents.service'
import { dispatchWorkflows } from './dispatcher'

/**
 * Punto único de emisión de eventos del CRM.
 *
 * Hace DOS cosas:
 *   1. Persiste un ContactEvent (alimenta la Timeline del contacto).
 *   2. Dispara los workflows de automatización suscritos a ese tipo de evento.
 *
 * El despacho de workflows es fire-and-forget: nunca bloquea ni hace fallar la
 * operación de negocio que generó el evento.
 */
export async function emitContactEvent(
  workspaceId: string,
  contactId: string,
  type: ContactEventType,
  title: string,
  description?: string,
  metadata?: Record<string, unknown>
) {
  const event = await createContactEvent(workspaceId, contactId, type, title, description, metadata)

  dispatchWorkflows(workspaceId, contactId, type, { event, metadata: metadata as any }).catch(err =>
    console.error('[automation] dispatch error:', err)
  )

  return event
}
