/**
 * Single source of truth for WhatsApp template variables — what {{n}} placeholders
 * can mean, and which ones each automation role sends today (see whatsappHandoff.ts,
 * appointment-notifications.service.ts, visitConfirmation.cron.ts for the actual
 * hardcoded send-time arrays this must stay in sync with).
 */

export interface TemplateVariableCatalogEntry {
  key: string
  label: string
  example: string
}

export const TEMPLATE_VARIABLE_CATALOG: TemplateVariableCatalogEntry[] = [
  { key: 'contact.name', label: 'Nombre del lead', example: 'Juan Pérez' },
  { key: 'contact.phone', label: 'Teléfono del lead', example: '+56912345678' },
  { key: 'appointment.when', label: 'Fecha y hora de visita', example: 'martes 12 de agosto, 10:00' }
]

export const ROLE_VARIABLE_REQUIREMENTS: Record<string, string[]> = {
  openingTemplateId: ['contact.name'],
  technicalVisitTemplateId: ['contact.name', 'contact.phone', 'appointment.when'],
  visitConfirmationTemplateId: ['contact.name']
}

export function isKnownVariableKey(key: string): boolean {
  return TEMPLATE_VARIABLE_CATALOG.some(v => v.key === key)
}

export function getVariableExample(key: string): string {
  const entry = TEMPLATE_VARIABLE_CATALOG.find(v => v.key === key)
  if (!entry) throw new Error(`Unknown template variable key: ${key}`)
  return entry.example
}

export function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}
