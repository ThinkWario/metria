/**
 * WhatsApp Cloud API — message template (HSM) management against the
 * WhatsApp Business Account (WABA), not the phone number. Templates must be
 * submitted here and approved by Meta before they can be sent.
 */

const WA_API_VERSION = 'v19.0'

export interface MetaTemplateResult {
  metaTemplateId: string
  status: string
}

export interface MetaTemplateSummary {
  id: string
  name: string
  language: string
  category: string
  status: string
  rejectedReason?: string
}

async function metaFetch(path: string, accessToken: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`https://graph.facebook.com/${WA_API_VERSION}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    }
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message = body?.error?.error_user_msg || body?.error?.message || `HTTP ${res.status}`
    throw new Error(`WhatsApp template API error: ${message}`)
  }
  return body
}

/** Submits a new template for Meta review. Body-only — no header/footer/buttons for now. */
export async function createMetaTemplate(
  wabaId: string,
  accessToken: string,
  template: { name: string; language: string; category: string; bodyText: string }
): Promise<MetaTemplateResult> {
  // Meta rejects with INVALID_FORMAT if the body has {{n}} placeholders but no
  // "example" sample value is provided for review.
  const varIndexes = [...template.bodyText.matchAll(/\{\{(\d+)\}\}/g)].map(m => parseInt(m[1], 10))
  const maxVar = varIndexes.length > 0 ? Math.max(...varIndexes) : 0
  const bodyComponent: Record<string, unknown> = { type: 'BODY', text: template.bodyText }
  if (maxVar > 0) {
    bodyComponent.example = { body_text: [Array.from({ length: maxVar }, (_, i) => `Ejemplo${i + 1}`)] }
  }

  const body = await metaFetch(`/${wabaId}/message_templates`, accessToken, {
    method: 'POST',
    body: JSON.stringify({
      name: template.name,
      language: template.language,
      category: template.category,
      components: [bodyComponent]
    })
  })
  return { metaTemplateId: body.id, status: body.status ?? 'PENDING' }
}

export async function listMetaTemplates(wabaId: string, accessToken: string): Promise<MetaTemplateSummary[]> {
  const body = await metaFetch(
    `/${wabaId}/message_templates?fields=name,language,category,status,rejected_reason&limit=100`,
    accessToken
  )
  return (body.data ?? []).map((t: any) => ({
    id: t.id,
    name: t.name,
    language: t.language,
    category: t.category,
    status: t.status,
    rejectedReason: t.rejected_reason !== 'NONE' ? t.rejected_reason : undefined
  }))
}

export async function deleteMetaTemplate(wabaId: string, accessToken: string, name: string): Promise<void> {
  await metaFetch(`/${wabaId}/message_templates?name=${encodeURIComponent(name)}`, accessToken, {
    method: 'DELETE'
  })
}
