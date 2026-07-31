/**
 * Domain-level event emitters — one function per dc_events_v1 taxonomy
 * entry. Callers (Sheets sync, AI qualification, scheduling, deal pipeline)
 * call these instead of building CAPI payloads themselves, so the mapping
 * from "CRM state change" to "Meta event" lives in exactly one place.
 *
 * Named emitMeta* (not emitContactEvent etc.) to avoid colliding with
 * modules/automation/emit's emitContactEvent, which writes unrelated
 * internal CRM timeline (ContactEvent) rows.
 */

import { emitConversionEvent, type ActionSource } from './metaEvents.capi'

interface ContactLike {
  id: string
  email?: string | null
  phone?: string | null
  fbc?: string | null
  fbp?: string | null
  clientIpAddress?: string | null
  clientUserAgent?: string | null
}

function toContactData(contact: ContactLike) {
  return {
    email: contact.email,
    phone: contact.phone,
    fbc: contact.fbc,
    fbp: contact.fbp,
    clientIpAddress: contact.clientIpAddress,
    clientUserAgent: contact.clientUserAgent
  }
}

// sessionId, when known, becomes the event_id subject (dc:v2:<session_id>:
// Contact / ...:Lead) instead of contact.id — matches the id a future
// browser-side Pixel/CAPI call for the same hito would use, so Meta can
// dedupe them. Falls back to contact.id when no sessionId is available.
export async function emitMetaContactEvent(
  workspaceId: string,
  contact: ContactLike,
  actionSource: ActionSource,
  customData?: Record<string, string | number | boolean>,
  sessionId?: string
): Promise<void> {
  await emitConversionEvent({
    workspaceId, leadId: contact.id, eventName: 'Contact', actionSource,
    occurredAt: new Date(), contact: toContactData(contact), customData,
    eventIdSubject: sessionId
  })
}

export async function emitMetaLeadEvent(
  workspaceId: string,
  contact: ContactLike,
  actionSource: ActionSource,
  customData?: Record<string, string | number | boolean>,
  sessionId?: string
): Promise<void> {
  await emitConversionEvent({
    workspaceId, leadId: contact.id, eventName: 'Lead', actionSource,
    occurredAt: new Date(), contact: toContactData(contact), customData,
    eventIdSubject: sessionId
  })
}

export async function emitMetaFinanceApplicationSubmittedEvent(
  workspaceId: string,
  contact: ContactLike,
  actionSource: ActionSource,
  sessionId?: string
): Promise<void> {
  await emitConversionEvent({
    workspaceId, leadId: contact.id, eventName: 'FinanceApplicationSubmitted', actionSource,
    occurredAt: new Date(), contact: toContactData(contact),
    eventIdSubject: sessionId
  })
}

export async function emitMetaQualifiedLeadEvent(
  workspaceId: string,
  contact: ContactLike,
  actionSource: ActionSource,
  params: { qualificationVersion: string; scoreBand?: string }
): Promise<void> {
  await emitConversionEvent({
    workspaceId, leadId: contact.id, eventName: 'QualifiedLead', actionSource,
    occurredAt: new Date(), contact: toContactData(contact),
    customData: { qualification_version: params.qualificationVersion, ...(params.scoreBand && { score_band: params.scoreBand }) }
  })
}

export async function emitMetaScheduleEvent(
  workspaceId: string,
  contact: ContactLike,
  appointmentId: string,
  actionSource: ActionSource
): Promise<void> {
  await emitConversionEvent({
    workspaceId, leadId: contact.id, eventName: 'Schedule', actionSource,
    occurredAt: new Date(), eventIdSuffix: appointmentId, contact: toContactData(contact)
  })
}

export async function emitMetaTechnicalReviewCompletedEvent(
  workspaceId: string,
  contact: ContactLike,
  appointmentId: string
): Promise<void> {
  await emitConversionEvent({
    workspaceId, leadId: contact.id, eventName: 'TechnicalReviewCompleted', actionSource: 'system_generated',
    occurredAt: new Date(), eventIdSuffix: appointmentId, contact: toContactData(contact)
  })
}

export async function emitMetaPurchaseEvent(
  workspaceId: string,
  contact: ContactLike,
  dealId: string,
  value: number,
  currency: string
): Promise<void> {
  await emitConversionEvent({
    workspaceId, leadId: contact.id, eventName: 'Purchase', actionSource: 'system_generated',
    occurredAt: new Date(), eventIdSuffix: dealId, contact: toContactData(contact),
    customData: { value, currency }
  })
}
