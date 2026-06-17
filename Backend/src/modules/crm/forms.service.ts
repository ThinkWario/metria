import { prisma } from '../../lib/prisma'
import { emitContactEvent } from '../automation/emit'

/* ============================================================================
 * Form Builder + public lead-capture service.
 *
 * `fields` JSON shape (stored on Form.fields, documented + validated here):
 *
 *   Array<{
 *     id: string                                         // stable client id (e.g. nanoid)
 *     label: string                                      // shown to the prospect
 *     type: 'text'|'email'|'tel'|'textarea'|'select'     // input kind
 *     required: boolean                                  // must be filled
 *     options?: string[]                                 // ONLY for type 'select'
 *   }>
 *
 * Public submissions are treated as hostile: every value is re-validated
 * server-side against the form's own field definitions before anything is
 * persisted. We never trust the client's idea of what's required or valid.
 * ========================================================================== */

export type FormFieldType = 'text' | 'email' | 'tel' | 'textarea' | 'select'

export interface FormField {
  id: string
  label: string
  type: FormFieldType
  required: boolean
  options?: string[]
}

const FIELD_TYPES: FormFieldType[] = ['text', 'email', 'tel', 'textarea', 'select']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Permissive phone: digits, spaces, +, -, (), at least 6 digits checked separately.
const PHONE_CHARS_RE = /^[\d\s+\-()]+$/

const MAX_FIELDS = 40
const MAX_LABEL = 120
const MAX_OPTION = 80
const MAX_OPTIONS = 30
const MAX_VALUE = 5000

// ── Slug helpers ─────────────────────────────────────────────────────────────

function slugify(input: string): string {
  const base = String(input || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accent diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
  return base || 'formulario'
}

async function uniqueSlug(base: string, ignoreId?: string): Promise<string> {
  let slug = base
  let n = 1
  // Loop until we find a slug not taken by *another* form.
  // Bounded by a sane cap to avoid pathological loops.
  while (n < 1000) {
    const existing = await prisma.form.findUnique({ where: { slug } })
    if (!existing || existing.id === ignoreId) return slug
    n += 1
    slug = `${base}-${n}`
  }
  // Extremely unlikely fallback.
  return `${base}-${Date.now()}`
}

// ── Field validation / normalization (used on create + update) ───────────────

/**
 * Validates and normalizes an incoming `fields` array. Throws on malformed
 * structure so we never persist a form a prospect couldn't fill.
 */
export function normalizeFields(raw: unknown): FormField[] {
  if (!Array.isArray(raw)) throw new Error('fields debe ser un arreglo')
  if (raw.length === 0) throw new Error('Agrega al menos un campo al formulario')
  if (raw.length > MAX_FIELDS) throw new Error(`Un formulario admite hasta ${MAX_FIELDS} campos`)

  const seenIds = new Set<string>()

  return raw.map((f: any, i: number): FormField => {
    const position = i + 1
    const id = String(f?.id ?? '').trim()
    if (!id) throw new Error(`El campo #${position} no tiene id`)
    if (seenIds.has(id)) throw new Error(`Hay campos con id duplicado: ${id}`)
    seenIds.add(id)

    const label = String(f?.label ?? '').trim().slice(0, MAX_LABEL)
    if (!label) throw new Error(`El campo #${position} necesita una etiqueta`)

    const type = String(f?.type ?? '') as FormFieldType
    if (!FIELD_TYPES.includes(type)) {
      throw new Error(`Tipo de campo inválido en "${label}": ${type}`)
    }

    const required = Boolean(f?.required)

    let options: string[] | undefined
    if (type === 'select') {
      const rawOpts: unknown[] = Array.isArray(f?.options) ? f.options : []
      const cleanOpts: string[] = rawOpts
        .map((o) => String(o ?? '').trim().slice(0, MAX_OPTION))
        .filter((o) => o.length > 0)
        .slice(0, MAX_OPTIONS)
      if (cleanOpts.length === 0) {
        throw new Error(`El campo de selección "${label}" necesita al menos una opción`)
      }
      options = cleanOpts
    }

    return { id, label, type, required, ...(options ? { options } : {}) }
  })
}

function parseFields(stored: unknown): FormField[] {
  // Stored fields were validated on write; be defensive on read anyway.
  if (!Array.isArray(stored)) return []
  return stored as FormField[]
}

// ── Public-safe shaping ──────────────────────────────────────────────────────

function toPublicForm(form: {
  name: string
  description: string | null
  fields: unknown
  submitButtonText: string
  successMessage: string
  slug: string
}) {
  return {
    slug: form.slug,
    name: form.name,
    description: form.description,
    fields: parseFields(form.fields),
    submitButtonText: form.submitButtonText,
    successMessage: form.successMessage
  }
}

// ── Authenticated CRUD ───────────────────────────────────────────────────────

export async function listForms(workspaceId: string) {
  return prisma.form.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' }
  })
}

export async function getForm(workspaceId: string, formId: string) {
  const form = await prisma.form.findFirst({ where: { id: formId, workspaceId } })
  if (!form) throw new Error('Form not found')
  return form
}

export interface CreateFormInput {
  name: string
  description?: string
  fields: unknown
  isActive?: boolean
  submitButtonText?: string
  successMessage?: string
}

export async function createForm(workspaceId: string, input: CreateFormInput) {
  const name = String(input.name ?? '').trim()
  if (!name) throw new Error('El nombre es obligatorio')

  const fields = normalizeFields(input.fields)
  const slug = await uniqueSlug(slugify(name))

  return prisma.form.create({
    data: {
      workspaceId,
      name: name.slice(0, 120),
      description: input.description?.trim()?.slice(0, 500) || null,
      fields: fields as any,
      slug,
      isActive: input.isActive ?? true,
      ...(input.submitButtonText?.trim()
        ? { submitButtonText: input.submitButtonText.trim().slice(0, 60) }
        : {}),
      ...(input.successMessage?.trim()
        ? { successMessage: input.successMessage.trim().slice(0, 300) }
        : {})
    }
  })
}

export interface UpdateFormInput {
  name?: string
  description?: string | null
  fields?: unknown
  isActive?: boolean
  submitButtonText?: string
  successMessage?: string
}

export async function updateForm(workspaceId: string, formId: string, input: UpdateFormInput) {
  const existing = await getForm(workspaceId, formId)

  const data: Record<string, any> = {}

  if (input.name !== undefined) {
    const name = String(input.name).trim()
    if (!name) throw new Error('El nombre es obligatorio')
    data.name = name.slice(0, 120)
    // Re-slug only when the name actually changed, keeping the URL stable otherwise.
    if (name !== existing.name) {
      data.slug = await uniqueSlug(slugify(name), formId)
    }
  }

  if (input.description !== undefined) {
    data.description = input.description ? String(input.description).trim().slice(0, 500) : null
  }

  if (input.fields !== undefined) {
    data.fields = normalizeFields(input.fields) as any
  }

  if (input.isActive !== undefined) {
    data.isActive = Boolean(input.isActive)
  }

  if (input.submitButtonText !== undefined) {
    const t = String(input.submitButtonText).trim()
    if (t) data.submitButtonText = t.slice(0, 60)
  }

  if (input.successMessage !== undefined) {
    const t = String(input.successMessage).trim()
    if (t) data.successMessage = t.slice(0, 300)
  }

  return prisma.form.update({ where: { id: formId }, data })
}

export async function deleteForm(workspaceId: string, formId: string) {
  await getForm(workspaceId, formId) // throws 'Form not found' if missing
  await prisma.form.delete({ where: { id: formId } })
}

// ── Public read ──────────────────────────────────────────────────────────────

/**
 * Returns only public-safe fields for an ACTIVE form. Throws 'Form not found'
 * for missing OR inactive forms — we never reveal that an inactive form exists.
 */
export async function getPublicForm(slug: string) {
  const cleaned = String(slug || '').toLowerCase().trim()
  if (!cleaned) throw new Error('Form not found')

  const form = await prisma.form.findUnique({ where: { slug: cleaned } })
  if (!form || !form.isActive) throw new Error('Form not found')

  return toPublicForm(form)
}

// ── Public submit ────────────────────────────────────────────────────────────

export class FormValidationError extends Error {
  fieldErrors: Record<string, string>
  constructor(message: string, fieldErrors: Record<string, string> = {}) {
    super(message)
    this.name = 'FormValidationError'
    this.fieldErrors = fieldErrors
  }
}

/**
 * Validates `data` against the form's own field definitions and returns a
 * cleaned record keyed by field id. Hostile input only — labels, requiredness
 * and select options come from the SERVER copy of the form, never the client.
 */
function validateSubmission(
  fields: FormField[],
  data: Record<string, unknown>
): { cleaned: Record<string, string>; firstEmail?: string; firstPhone?: string; name?: string } {
  const cleaned: Record<string, string> = {}
  const errors: Record<string, string> = {}
  let firstEmail: string | undefined
  let firstPhone: string | undefined
  let name: string | undefined

  for (const field of fields) {
    const rawVal = data?.[field.id]
    const value = rawVal == null ? '' : String(rawVal).trim().slice(0, MAX_VALUE)

    if (!value) {
      if (field.required) errors[field.id] = `${field.label} es obligatorio`
      continue
    }

    switch (field.type) {
      case 'email':
        if (!EMAIL_RE.test(value)) {
          errors[field.id] = `${field.label} no es un correo válido`
          continue
        }
        if (!firstEmail) firstEmail = value.toLowerCase()
        break
      case 'tel':
        if (!PHONE_CHARS_RE.test(value) || value.replace(/\D/g, '').length < 6) {
          errors[field.id] = `${field.label} no es un teléfono válido`
          continue
        }
        if (!firstPhone) firstPhone = value
        break
      case 'select':
        if (field.options && !field.options.includes(value)) {
          errors[field.id] = `Selecciona una opción válida en ${field.label}`
          continue
        }
        break
      default:
        break
    }

    cleaned[field.id] = value

    // Best-effort name detection from common label wording.
    if (!name && /nombre|name/i.test(field.label)) name = value
  }

  if (Object.keys(errors).length > 0) {
    throw new FormValidationError('Revisa los campos marcados', errors)
  }

  return { cleaned, firstEmail, firstPhone, name }
}

/**
 * Public, unauthenticated submission. Validates, find-or-creates a Contact
 * (source 'FORM'), records a FormSubmission, bumps the counter, and emits
 * FORM_SUBMITTED so the contact Timeline updates AND any FORM_SUBMITTED
 * workflow fires.
 */
export async function submitForm(slug: string, data: unknown): Promise<{ ok: true }> {
  const cleaned = String(slug || '').toLowerCase().trim()
  if (!cleaned) throw new Error('Form not found')

  const form = await prisma.form.findUnique({ where: { slug: cleaned } })
  if (!form || !form.isActive) throw new Error('Form not found')

  const fields = parseFields(form.fields)
  const body = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>

  const { cleaned: cleanData, firstEmail, firstPhone, name } = validateSubmission(fields, body)

  // ── Find-or-create contact (match by email or phone present in data) ──
  const orClauses: Record<string, unknown>[] = []
  if (firstEmail) orClauses.push({ email: firstEmail })
  if (firstPhone) orClauses.push({ phone: firstPhone })

  let contact =
    orClauses.length > 0
      ? await prisma.contact.findFirst({
          where: { workspaceId: form.workspaceId, OR: orClauses }
        })
      : null

  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        workspaceId: form.workspaceId,
        name: (name || firstEmail || firstPhone || 'Lead de formulario').slice(0, 120),
        email: firstEmail ?? null,
        phone: firstPhone ?? null,
        source: 'FORM',
        status: 'LEAD'
      }
    })
  }

  // ── Persist submission + bump counter ──
  const submission = await prisma.formSubmission.create({
    data: {
      workspaceId: form.workspaceId,
      formId: form.id,
      contactId: contact.id,
      data: cleanData as any
    }
  })

  await prisma.form.update({
    where: { id: form.id },
    data: { submissionCount: { increment: 1 } }
  })

  // ── Timeline event + automation trigger (fire-and-forget inside emit) ──
  await emitContactEvent(
    form.workspaceId,
    contact.id,
    'FORM_SUBMITTED',
    `Lead capturado: ${form.name}`,
    undefined,
    { formId: form.id, submissionId: submission.id }
  )

  return { ok: true }
}
