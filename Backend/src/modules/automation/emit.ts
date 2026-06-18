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
 * Es un side-effect resiliente: ni la persistencia del evento ni el despacho de
 * workflows deben jamás bloquear ni hacer fallar la operación de negocio que lo
 * generó (mover un deal, completar una tarea, etc.). Por eso ambos pasos están
 * protegidos y nunca propagan una excepción al llamador.
 */
export async function emitContactEvent(
  workspaceId: string,
  contactId: string,
  type: ContactEventType,
  title: string,
  description?: string,
  metadata?: Record<string, unknown>
) {
  let event = null
  try {
    event = await createContactEvent(workspaceId, contactId, type, title, description, metadata)
  } catch (err) {
    console.error('[automation] no se pudo persistir el ContactEvent:', err)
  }

  dispatchWorkflows(workspaceId, contactId, type, { event, metadata: metadata as any }).catch(err =>
    console.error('[automation] dispatch error:', err)
  )

  return event
}
