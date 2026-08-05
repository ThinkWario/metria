# WhatsApp Templates Page + Variable Binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move WhatsApp template management out of the cramped card inside "Canales de Mensajería" into its own full-width page, add a "view full template" modal, and let template creators map each `{{n}}` placeholder to a real data variable (instead of an untracked, auto-generated example) so template↔role assignment can be validated instead of failing silently at send time.

**Architecture:** A new backend module (`templateVariables.ts`) is the single source of truth for the variable catalog and the per-role variable requirements. `createTemplateHandler` validates and persists the chosen variables (already-existing but unused `WhatsAppTemplate.variables` column); `createMetaTemplate` uses them to build a real Meta "example" payload instead of generic placeholders. Role-assignment handlers (`setOpeningTemplateHandler`, `setTemplateRoleHandler`) reject a template whose variables don't match what that role's send code already hardcodes. The frontend gets a new route `/dashboard/settings/channels/templates` hosting the (enhanced) `WhatsAppTemplatesPanel`, while the old location shows a small summary card linking to it.

**Tech Stack:** Express + Prisma (backend), Next.js App Router + React + shadcn/ui (frontend), Vitest for both.

## Global Constraints

- Spanish (Chile, no voseo) for all user-facing copy — match the existing tone in `WhatsAppTemplatesPanel.tsx` and `templates.controller.ts` error messages.
- **Backward compatibility is mandatory**: templates created before this change have `variables = null` in the DB. They must remain assignable to any role exactly as today — no forced migration, no blocking behavior for `null`.
- **Do not modify** `Backend/src/modules/leads/whatsappHandoff.ts`, `Backend/src/modules/scheduling/appointment-notifications.service.ts`, or `Backend/src/modules/scheduling/visitConfirmation.cron.ts` — the send-time hardcoded parameter arrays stay exactly as-is (see design spec `docs/superpowers/specs/2026-08-05-whatsapp-templates-page-design.md`, section 6).
- All new/modified backend routes keep the existing `authenticate, requirePlan('PRO', 'SCALE')` gate.
- Match each file's existing code style exactly (this codebase mixes semicolon and no-semicolon styles per-file — copy what's already in the file you're editing, don't impose a new one).
- Backend tests: `cd Backend && npx vitest run <path>`. Frontend tests: `cd metria-metrics/Frontend && npx vitest run <path>`.

---

### Task 1: Variable catalog module

**Files:**
- Create: `Backend/src/modules/messaging/templateVariables.ts`
- Test: `Backend/src/modules/messaging/__tests__/templateVariables.test.ts`

**Interfaces:**
- Produces: `TEMPLATE_VARIABLE_CATALOG: { key: string; label: string; example: string }[]`, `ROLE_VARIABLE_REQUIREMENTS: Record<string, string[]>`, `isKnownVariableKey(key: string): boolean`, `getVariableExample(key: string): string` (throws on unknown key), `arraysEqual(a: string[], b: string[]): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// Backend/src/modules/messaging/__tests__/templateVariables.test.ts
import { describe, it, expect } from 'vitest'
import {
  TEMPLATE_VARIABLE_CATALOG,
  ROLE_VARIABLE_REQUIREMENTS,
  isKnownVariableKey,
  getVariableExample,
  arraysEqual
} from '../templateVariables'

describe('templateVariables catalog', () => {
  it('isKnownVariableKey returns true for catalog keys and false otherwise', () => {
    expect(isKnownVariableKey('contact.name')).toBe(true)
    expect(isKnownVariableKey('not.a.key')).toBe(false)
  })

  it('getVariableExample returns the example value for a known key', () => {
    expect(getVariableExample('contact.name')).toBe('Juan Pérez')
  })

  it('getVariableExample throws for an unknown key', () => {
    expect(() => getVariableExample('not.a.key')).toThrow('Unknown template variable key: not.a.key')
  })

  it('arraysEqual compares order and length, not just membership', () => {
    expect(arraysEqual(['a', 'b'], ['a', 'b'])).toBe(true)
    expect(arraysEqual(['a', 'b'], ['b', 'a'])).toBe(false)
    expect(arraysEqual(['a'], ['a', 'b'])).toBe(false)
  })

  it('ROLE_VARIABLE_REQUIREMENTS matches what each send call site already hardcodes', () => {
    expect(ROLE_VARIABLE_REQUIREMENTS.openingTemplateId).toEqual(['contact.name'])
    expect(ROLE_VARIABLE_REQUIREMENTS.technicalVisitTemplateId).toEqual(['contact.name', 'contact.phone', 'appointment.when'])
    expect(ROLE_VARIABLE_REQUIREMENTS.visitConfirmationTemplateId).toEqual(['contact.name'])
  })

  it('TEMPLATE_VARIABLE_CATALOG has a unique key per entry', () => {
    const keys = TEMPLATE_VARIABLE_CATALOG.map(v => v.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Backend && npx vitest run src/modules/messaging/__tests__/templateVariables.test.ts`
Expected: FAIL — `Cannot find module '../templateVariables'`

- [ ] **Step 3: Write minimal implementation**

```ts
// Backend/src/modules/messaging/templateVariables.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd Backend && npx vitest run src/modules/messaging/__tests__/templateVariables.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add Backend/src/modules/messaging/templateVariables.ts Backend/src/modules/messaging/__tests__/templateVariables.test.ts
git commit -m "feat(messaging): add WhatsApp template variable catalog"
```

---

### Task 2: `createMetaTemplate` uses real example values

**Files:**
- Modify: `Backend/src/modules/messaging/channels/whatsappTemplates.client.ts`
- Test: `Backend/src/modules/messaging/__tests__/whatsappTemplates.client.test.ts`

**Interfaces:**
- Consumes: `getVariableExample(key: string): string` from Task 1 (`../templateVariables`).
- Produces: `createMetaTemplate(wabaId, accessToken, template: { name; language; category; bodyText; variables?: string[] }): Promise<MetaTemplateResult>` — signature grows an optional `variables` field, return type unchanged.

- [ ] **Step 1: Write the failing test**

```ts
// Backend/src/modules/messaging/__tests__/whatsappTemplates.client.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMetaTemplate } from '../channels/whatsappTemplates.client'

beforeEach(() => vi.stubGlobal('fetch', vi.fn()))
afterEach(() => vi.restoreAllMocks())

describe('createMetaTemplate — example values', () => {
  it('uses the catalog example values, in order, when variables are provided', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true, status: 200, json: async () => ({ id: 'meta-1', status: 'PENDING' })
    } as Response)

    await createMetaTemplate('waba-1', 'token-1', {
      name: 'saludo',
      language: 'es',
      category: 'MARKETING',
      bodyText: 'Hola {{1}}, tu teléfono es {{2}}',
      variables: ['contact.name', 'contact.phone']
    })

    const [, options] = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse(options!.body as string)
    expect(body.components[0].example.body_text).toEqual([['Juan Pérez', '+56912345678']])
  })

  it('falls back to generic placeholders when no variables are provided (legacy path)', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true, status: 200, json: async () => ({ id: 'meta-2', status: 'PENDING' })
    } as Response)

    await createMetaTemplate('waba-1', 'token-1', {
      name: 'saludo_legacy',
      language: 'es',
      category: 'MARKETING',
      bodyText: 'Hola {{1}}'
    })

    const [, options] = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse(options!.body as string)
    expect(body.components[0].example.body_text).toEqual([['Ejemplo1']])
  })

  it('falls back to generic placeholders when variables.length does not match the {{n}} count', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true, status: 200, json: async () => ({ id: 'meta-3', status: 'PENDING' })
    } as Response)

    await createMetaTemplate('waba-1', 'token-1', {
      name: 'saludo_mismatch',
      language: 'es',
      category: 'MARKETING',
      bodyText: 'Hola {{1}} y {{2}}',
      variables: ['contact.name']
    })

    const [, options] = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse(options!.body as string)
    expect(body.components[0].example.body_text).toEqual([['Ejemplo1', 'Ejemplo2']])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Backend && npx vitest run src/modules/messaging/__tests__/whatsappTemplates.client.test.ts`
Expected: FAIL on the first test — receives `['Ejemplo1', 'Ejemplo2']` instead of `['Juan Pérez', '+56912345678']`

- [ ] **Step 3: Modify `createMetaTemplate`**

In `Backend/src/modules/messaging/channels/whatsappTemplates.client.ts`, add the import and update the function (replaces lines 40-53):

```ts
import { getVariableExample } from '../templateVariables'

// ... (keep everything above unchanged) ...

/** Submits a new template for Meta review. Body-only — no header/footer/buttons for now. */
export async function createMetaTemplate(
  wabaId: string,
  accessToken: string,
  template: { name: string; language: string; category: string; bodyText: string; variables?: string[] }
): Promise<MetaTemplateResult> {
  // Meta rejects with INVALID_FORMAT if the body has {{n}} placeholders but no
  // "example" sample value is provided for review.
  const varIndexes = [...template.bodyText.matchAll(/\{\{(\d+)\}\}/g)].map(m => parseInt(m[1], 10))
  const maxVar = varIndexes.length > 0 ? Math.max(...varIndexes) : 0
  const bodyComponent: Record<string, unknown> = { type: 'BODY', text: template.bodyText }
  if (maxVar > 0) {
    const exampleValues = template.variables && template.variables.length === maxVar
      ? template.variables.map(key => getVariableExample(key))
      : Array.from({ length: maxVar }, (_, i) => `Ejemplo${i + 1}`)
    bodyComponent.example = { body_text: [exampleValues] }
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd Backend && npx vitest run src/modules/messaging/__tests__/whatsappTemplates.client.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add Backend/src/modules/messaging/channels/whatsappTemplates.client.ts Backend/src/modules/messaging/__tests__/whatsappTemplates.client.test.ts
git commit -m "feat(messaging): build real Meta template examples from mapped variables"
```

---

### Task 3: Variable catalog endpoint

**Files:**
- Modify: `Backend/src/modules/messaging/templates.controller.ts`
- Modify: `Backend/src/modules/messaging/messaging.routes.ts`
- Test: `Backend/src/modules/messaging/__tests__/templates.catalog.test.ts`

**Interfaces:**
- Consumes: `TEMPLATE_VARIABLE_CATALOG` from Task 1.
- Produces: `getTemplateVariableCatalogHandler(req: Request, res: Response): Promise<void>`, route `GET /messaging/whatsapp/templates/variable-catalog` → `{ catalog: TemplateVariableCatalogEntry[] }`.

- [ ] **Step 1: Write the failing test**

```ts
// Backend/src/modules/messaging/__tests__/templates.catalog.test.ts
import { describe, it, expect, vi } from 'vitest'
import { getTemplateVariableCatalogHandler } from '../templates.controller'
import { TEMPLATE_VARIABLE_CATALOG } from '../templateVariables'

describe('getTemplateVariableCatalogHandler', () => {
  it('returns the full variable catalog as JSON', async () => {
    const req = {} as any
    const res = { json: vi.fn() } as any

    await getTemplateVariableCatalogHandler(req, res)

    expect(res.json).toHaveBeenCalledWith({ catalog: TEMPLATE_VARIABLE_CATALOG })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Backend && npx vitest run src/modules/messaging/__tests__/templates.catalog.test.ts`
Expected: FAIL — `getTemplateVariableCatalogHandler is not a function` (not exported yet)

- [ ] **Step 3: Add the handler and route**

In `Backend/src/modules/messaging/templates.controller.ts`, add the import at the top (alongside the existing `whatsappTemplates.client` import) and the new handler anywhere after `listTemplatesHandler`:

```ts
import { TEMPLATE_VARIABLE_CATALOG } from './templateVariables'

export async function getTemplateVariableCatalogHandler(req: Request, res: Response): Promise<void> {
  res.json({ catalog: TEMPLATE_VARIABLE_CATALOG })
}
```

In `Backend/src/modules/messaging/messaging.routes.ts`, add `getTemplateVariableCatalogHandler` to the destructured import from `./templates.controller` (line 21-28) and register the route right after line 56 (`GET /messaging/whatsapp/templates`):

```ts
import {
  listTemplatesHandler,
  createTemplateHandler,
  syncTemplatesHandler,
  deleteTemplateHandler,
  setOpeningTemplateHandler,
  setTemplateRoleHandler,
  getTemplateVariableCatalogHandler
} from './templates.controller'

// ...

router.get('/messaging/whatsapp/templates', authenticate, requirePlan('PRO', 'SCALE'), listTemplatesHandler)
router.get('/messaging/whatsapp/templates/variable-catalog', authenticate, requirePlan('PRO', 'SCALE'), getTemplateVariableCatalogHandler)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd Backend && npx vitest run src/modules/messaging/__tests__/templates.catalog.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add Backend/src/modules/messaging/templates.controller.ts Backend/src/modules/messaging/messaging.routes.ts Backend/src/modules/messaging/__tests__/templates.catalog.test.ts
git commit -m "feat(messaging): expose GET /messaging/whatsapp/templates/variable-catalog"
```

---

### Task 4: `createTemplateHandler` validates and persists variables

**Files:**
- Modify: `Backend/src/modules/messaging/templates.controller.ts`
- Test: `Backend/src/modules/messaging/__tests__/templates.create.test.ts`

**Interfaces:**
- Consumes: `isKnownVariableKey(key: string): boolean` from Task 1, `createMetaTemplate(...)` (now accepts `variables?: string[]`) from Task 2.
- Produces: `createTemplateHandler` now validates `req.body.variables` before calling Meta; on success the created row's `variables` column is populated.

- [ ] **Step 1: Write the failing test**

```ts
// Backend/src/modules/messaging/__tests__/templates.create.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTemplateHandler } from '../templates.controller'
import { prisma } from '../../../lib/prisma'
import { createMetaTemplate } from '../channels/whatsappTemplates.client'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    channel: { findFirst: vi.fn(), update: vi.fn() },
    whatsAppTemplate: { findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn() }
  }
}))

vi.mock('../channels/whatsappTemplates.client', () => ({
  createMetaTemplate: vi.fn(),
  listMetaTemplates: vi.fn(),
  deleteMetaTemplate: vi.fn()
}))

function buildReq(body: any) {
  return { user: { workspaceId: 'ws-1' }, body } as any
}

function buildRes() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any
}

const CONNECTED_CHANNEL = { id: 'ch-1', config: { wabaId: 'waba-1', accessToken: 'token-1' } }

describe('createTemplateHandler — variable validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.channel.findFirst).mockResolvedValue(CONNECTED_CHANNEL as any)
  })

  it('returns 400 when variables.length does not match the {{n}} count in bodyText', async () => {
    const req = buildReq({ name: 'saludo', bodyText: 'Hola {{1}} y {{2}}', variables: ['contact.name'] })
    const res = buildRes()

    await createTemplateHandler(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(createMetaTemplate).not.toHaveBeenCalled()
  })

  it('returns 400 when a variable key is not in the catalog', async () => {
    const req = buildReq({ name: 'saludo', bodyText: 'Hola {{1}}', variables: ['not.a.real.key'] })
    const res = buildRes()

    await createTemplateHandler(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(createMetaTemplate).not.toHaveBeenCalled()
  })

  it('forwards variables to createMetaTemplate and persists them when everything matches', async () => {
    vi.mocked(createMetaTemplate).mockResolvedValue({ metaTemplateId: 'meta-1', status: 'PENDING' })
    vi.mocked(prisma.whatsAppTemplate.create).mockResolvedValue({ id: 'tpl-1' } as any)
    const req = buildReq({ name: 'saludo', bodyText: 'Hola {{1}}', variables: ['contact.name'] })
    const res = buildRes()

    await createTemplateHandler(req, res)

    expect(createMetaTemplate).toHaveBeenCalledWith('waba-1', 'token-1', expect.objectContaining({
      variables: ['contact.name']
    }))
    expect(prisma.whatsAppTemplate.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ variables: ['contact.name'] })
    }))
    expect(res.status).toHaveBeenCalledWith(201)
  })

  it('creates the template without variables when the body has no placeholders (legacy path)', async () => {
    vi.mocked(createMetaTemplate).mockResolvedValue({ metaTemplateId: 'meta-2', status: 'PENDING' })
    vi.mocked(prisma.whatsAppTemplate.create).mockResolvedValue({ id: 'tpl-2' } as any)
    const req = buildReq({ name: 'saludo_fijo', bodyText: 'Hola, gracias por tu interés' })
    const res = buildRes()

    await createTemplateHandler(req, res)

    expect(res.status).toHaveBeenCalledWith(201)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Backend && npx vitest run src/modules/messaging/__tests__/templates.create.test.ts`
Expected: FAIL on the first two tests — handler currently calls `createMetaTemplate` regardless of a length/key mismatch

- [ ] **Step 3: Add validation to `createTemplateHandler`**

In `Backend/src/modules/messaging/templates.controller.ts`, add the import next to the existing `whatsappTemplates.client` import:

```ts
import { isKnownVariableKey } from './templateVariables'
```

Replace the body of `createTemplateHandler` (currently lines 33-73) with:

```ts
export async function createTemplateHandler(req: Request, res: Response): Promise<void> {
  try {
    const workspaceId = (req as AuthRequest).user!.workspaceId as string
    const { name, language, category, bodyText, variables } = req.body as {
      name?: string; language?: string; category?: string; bodyText?: string; variables?: string[]
    }
    if (!name || !bodyText) { res.status(400).json({ error: 'name y bodyText son obligatorios' }); return }

    const varIndexes = [...bodyText.matchAll(/\{\{(\d+)\}\}/g)].map(m => parseInt(m[1], 10))
    const maxVar = varIndexes.length > 0 ? Math.max(...varIndexes) : 0

    if (variables !== undefined) {
      if (variables.length !== maxVar) {
        res.status(400).json({ error: `El texto tiene ${maxVar} variable(s) pero se mapearon ${variables.length}` })
        return
      }
      const unknownKey = variables.find(key => !isKnownVariableKey(key))
      if (unknownKey) {
        res.status(400).json({ error: `Variable desconocida: ${unknownKey}` })
        return
      }
    }

    const channel = await getWhatsAppChannel(workspaceId)
    if (!channel) { res.status(404).json({ error: 'No hay un canal WhatsApp conectado' }); return }

    const config = channel.config as Record<string, string>
    if (!config.wabaId) { res.status(400).json({ error: 'Falta configurar el WABA ID del canal' }); return }
    if (!config.accessToken) { res.status(400).json({ error: 'Falta configurar el access token del canal' }); return }

    const resolvedLanguage = language || 'es'
    const resolvedCategory = category || 'MARKETING'

    const meta = await createMetaTemplate(config.wabaId, config.accessToken, {
      name, language: resolvedLanguage, category: resolvedCategory, bodyText, variables
    })

    const template = await prisma.whatsAppTemplate.create({
      data: {
        workspaceId,
        channelId: channel.id,
        name,
        language: resolvedLanguage,
        category: resolvedCategory,
        bodyText,
        variables: variables ?? undefined,
        status: meta.status,
        metaTemplateId: meta.metaTemplateId
      }
    })
    res.status(201).json(template)
  } catch (err: any) {
    console.error('[Templates] create error:', err)
    res.status(502).json({ error: err?.message ?? 'Error al crear la plantilla en Meta' })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd Backend && npx vitest run src/modules/messaging/__tests__/templates.create.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full backend test suite to check nothing regressed**

Run: `cd Backend && npx vitest run`
Expected: PASS (no pre-existing test touches `createTemplateHandler`, so no regressions expected — confirm the run is green)

- [ ] **Step 6: Commit**

```bash
git add Backend/src/modules/messaging/templates.controller.ts Backend/src/modules/messaging/__tests__/templates.create.test.ts
git commit -m "feat(messaging): validate and persist mapped variables on template creation"
```

---

### Task 5: Role assignment validates variable compatibility

**Files:**
- Modify: `Backend/src/modules/messaging/templates.controller.ts`
- Test: `Backend/src/modules/messaging/__tests__/templates.role-assignment.test.ts`

**Interfaces:**
- Consumes: `ROLE_VARIABLE_REQUIREMENTS`, `arraysEqual` from Task 1.
- Produces: `setOpeningTemplateHandler` and `setTemplateRoleHandler` now reject (400) when `template.variables` is non-null and doesn't exactly match the role's required array; `variables === null` (legacy) is still allowed, unchanged from today.

- [ ] **Step 1: Write the failing test**

```ts
// Backend/src/modules/messaging/__tests__/templates.role-assignment.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setOpeningTemplateHandler, setTemplateRoleHandler } from '../templates.controller'
import { prisma } from '../../../lib/prisma'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    channel: { findFirst: vi.fn(), update: vi.fn() },
    whatsAppTemplate: { findFirst: vi.fn() }
  }
}))

function buildReq(params: any, body: any = {}) {
  return { user: { workspaceId: 'ws-1' }, params, body } as any
}

function buildRes() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any
}

const CONNECTED_CHANNEL = { id: 'ch-1', config: {} }

describe('template role assignment — variable compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.channel.findFirst).mockResolvedValue(CONNECTED_CHANNEL as any)
    vi.mocked(prisma.channel.update).mockResolvedValue({ config: {} } as any)
  })

  it('rejects setOpeningTemplateHandler when template.variables does not match [contact.name]', async () => {
    vi.mocked(prisma.whatsAppTemplate.findFirst).mockResolvedValue({
      id: 'tpl-1', status: 'APPROVED', variables: ['contact.name', 'contact.phone']
    } as any)
    const req = buildReq({ id: 'tpl-1' })
    const res = buildRes()

    await setOpeningTemplateHandler(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(prisma.channel.update).not.toHaveBeenCalled()
  })

  it('allows setOpeningTemplateHandler when template.variables is exactly [contact.name]', async () => {
    vi.mocked(prisma.whatsAppTemplate.findFirst).mockResolvedValue({
      id: 'tpl-1', status: 'APPROVED', variables: ['contact.name']
    } as any)
    const req = buildReq({ id: 'tpl-1' })
    const res = buildRes()

    await setOpeningTemplateHandler(req, res)

    expect(res.status).not.toHaveBeenCalledWith(400)
    expect(prisma.channel.update).toHaveBeenCalled()
  })

  it('allows setOpeningTemplateHandler when template.variables is null (legacy template)', async () => {
    vi.mocked(prisma.whatsAppTemplate.findFirst).mockResolvedValue({
      id: 'tpl-1', status: 'APPROVED', variables: null
    } as any)
    const req = buildReq({ id: 'tpl-1' })
    const res = buildRes()

    await setOpeningTemplateHandler(req, res)

    expect(res.status).not.toHaveBeenCalledWith(400)
    expect(prisma.channel.update).toHaveBeenCalled()
  })

  it('rejects setTemplateRoleHandler for technicalVisitTemplateId when variable order is wrong', async () => {
    vi.mocked(prisma.whatsAppTemplate.findFirst).mockResolvedValue({
      id: 'tpl-2', status: 'APPROVED', variables: ['contact.phone', 'contact.name', 'appointment.when']
    } as any)
    const req = buildReq({ role: 'technicalVisitTemplateId' }, { templateId: 'tpl-2' })
    const res = buildRes()

    await setTemplateRoleHandler(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(prisma.channel.update).not.toHaveBeenCalled()
  })

  it('allows setTemplateRoleHandler for technicalVisitTemplateId when variables match exactly', async () => {
    vi.mocked(prisma.whatsAppTemplate.findFirst).mockResolvedValue({
      id: 'tpl-2', status: 'APPROVED', variables: ['contact.name', 'contact.phone', 'appointment.when']
    } as any)
    const req = buildReq({ role: 'technicalVisitTemplateId' }, { templateId: 'tpl-2' })
    const res = buildRes()

    await setTemplateRoleHandler(req, res)

    expect(res.status).not.toHaveBeenCalledWith(400)
    expect(prisma.channel.update).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd Backend && npx vitest run src/modules/messaging/__tests__/templates.role-assignment.test.ts`
Expected: FAIL on the mismatch tests — nothing validates variables today, both assignments succeed unconditionally

- [ ] **Step 3: Add validation to both handlers**

In `Backend/src/modules/messaging/templates.controller.ts`, there are already two separate imports from `./templateVariables` (one from Task 3: `{ TEMPLATE_VARIABLE_CATALOG }`, one from Task 4: `{ isKnownVariableKey }`). Replace both with a single merged import line:

```ts
import { TEMPLATE_VARIABLE_CATALOG, isKnownVariableKey, ROLE_VARIABLE_REQUIREMENTS, arraysEqual } from './templateVariables'
```

In `setOpeningTemplateHandler`, insert this block right after the existing `if (template.status !== 'APPROVED') { ...; return }` check (before `const config = channel.config...`):

```ts
    if (template.variables !== null) {
      const templateVars = template.variables as string[]
      const required = ROLE_VARIABLE_REQUIREMENTS.openingTemplateId
      if (!arraysEqual(templateVars, required)) {
        res.status(400).json({
          error: `Esta plantilla usa variables [${templateVars.join(', ')}] pero este rol requiere [${required.join(', ')}]`
        })
        return
      }
    }
```

In `setTemplateRoleHandler`, insert the equivalent block right after the existing `if (template.status !== 'APPROVED') { ...; return }` check inside the `if (templateId) { ... }` block (before the closing brace of that `if`):

```ts
      if (template.variables !== null) {
        const templateVars = template.variables as string[]
        const required = ROLE_VARIABLE_REQUIREMENTS[role]
        if (!arraysEqual(templateVars, required)) {
          res.status(400).json({
            error: `Esta plantilla usa variables [${templateVars.join(', ')}] pero este rol requiere [${required.join(', ')}]`
          })
          return
        }
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd Backend && npx vitest run src/modules/messaging/__tests__/templates.role-assignment.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Run the full backend test suite**

Run: `cd Backend && npx vitest run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add Backend/src/modules/messaging/templates.controller.ts Backend/src/modules/messaging/__tests__/templates.role-assignment.test.ts
git commit -m "fix(messaging): reject template role assignment when variables don't match the role"
```

---

### Task 6: Frontend — map `{{n}}` to catalog variables on creation

**Files:**
- Modify: `metria-metrics/Frontend/src/app/dashboard/settings/channels/WhatsAppTemplatesPanel.tsx`
- Test: `metria-metrics/Frontend/src/app/dashboard/settings/channels/__tests__/WhatsAppTemplatesPanel.variables.test.tsx`

**Interfaces:**
- Consumes: `GET /messaging/whatsapp/templates/variable-catalog` → `{ catalog: { key, label, example }[] }` from Task 3; `POST /messaging/whatsapp/templates` now accepts `variables?: string[]` from Task 4.

- [ ] **Step 1: Write the failing test**

```tsx
// metria-metrics/Frontend/src/app/dashboard/settings/channels/__tests__/WhatsAppTemplatesPanel.variables.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { mockFetchAPI } = vi.hoisted(() => ({ mockFetchAPI: vi.fn() }))
vi.mock('@/lib/api', () => ({ fetchAPI: mockFetchAPI }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { WhatsAppTemplatesPanel } from '../WhatsAppTemplatesPanel'

const CATALOG = [
  { key: 'contact.name', label: 'Nombre del lead', example: 'Juan Pérez' },
  { key: 'contact.phone', label: 'Teléfono del lead', example: '+56912345678' }
]

const EMPTY_LIST = { templates: [], openingTemplateId: null, technicalVisitTemplateId: null, visitConfirmationTemplateId: null }

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchAPI.mockImplementation((endpoint: string) => {
    if (endpoint === '/messaging/whatsapp/templates/variable-catalog') return Promise.resolve({ catalog: CATALOG })
    if (endpoint === '/messaging/whatsapp/templates') return Promise.resolve(EMPTY_LIST)
    return Promise.resolve({})
  })
})

describe('WhatsAppTemplatesPanel — variable mapping', () => {
  it('renders one variable select per {{n}} detected in the body text', async () => {
    const user = userEvent.setup()
    render(<WhatsAppTemplatesPanel />)

    const body = await screen.findByLabelText(/Texto/i)
    await user.type(body, 'Hola {{1}}, tu contacto es {{2}}')

    await waitFor(() => {
      expect(screen.getAllByText('Elegir variable')).toHaveLength(2)
    })
  })

  it('blocks submit until every detected variable has a mapping selected', async () => {
    const user = userEvent.setup()
    render(<WhatsAppTemplatesPanel />)

    await user.type(await screen.findByLabelText(/Nombre/i), 'saludo_test')
    await user.type(await screen.findByLabelText(/Texto/i), 'Hola {{1}}')
    await user.click(screen.getByRole('button', { name: /crear y enviar a revisión/i }))

    expect(mockFetchAPI).not.toHaveBeenCalledWith('/messaging/whatsapp/templates', expect.objectContaining({ method: 'POST' }))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd metria-metrics/Frontend && npx vitest run src/app/dashboard/settings/channels/__tests__/WhatsAppTemplatesPanel.variables.test.tsx`
Expected: FAIL — no selects rendered today, `{{n}}` typed into the textarea has no effect on the UI

- [ ] **Step 3: Add catalog fetch, detection, and selects**

In `metria-metrics/Frontend/src/app/dashboard/settings/channels/WhatsAppTemplatesPanel.tsx`:

Change the import line 1 to add `useMemo`:

```tsx
import React, { useEffect, useMemo, useState } from 'react'
```

Add a state field for the catalog and one for the chosen mapping, right after the existing `bodyText` state (around line 50):

```tsx
    const [catalog, setCatalog] = useState<{ key: string; label: string; example: string }[]>([])
    const [variableMap, setVariableMap] = useState<string[]>([])
```

Add the detection logic (computed from `bodyText`) right after those two `useState` calls:

```tsx
    const detectedVariableCount = useMemo(() => {
        const indexes = [...bodyText.matchAll(/\{\{(\d+)\}\}/g)].map(m => parseInt(m[1], 10))
        return indexes.length > 0 ? Math.max(...indexes) : 0
    }, [bodyText])
```

Add a `useEffect` to load the catalog once, and one to keep `variableMap` in sync with `detectedVariableCount`, right after the existing `useEffect(() => { load() }, [])` (around line 67):

```tsx
    useEffect(() => {
        fetchAPI('/messaging/whatsapp/templates/variable-catalog')
            .then(data => setCatalog(data.catalog ?? []))
            .catch(() => {})
    }, [])

    useEffect(() => {
        setVariableMap(prev => {
            if (prev.length === detectedVariableCount) return prev
            const next = prev.slice(0, detectedVariableCount)
            while (next.length < detectedVariableCount) next.push('')
            return next
        })
    }, [detectedVariableCount])
```

Update `handleCreate` (currently lines 82-105) to validate the mapping and send it:

```tsx
    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault()
        const cleanName = sanitizeName(name)
        if (!cleanName || !bodyText.trim()) {
            toast.error('Nombre y texto de la plantilla son obligatorios')
            return
        }
        if (detectedVariableCount > 0 && variableMap.some(v => !v)) {
            toast.error('Selecciona una variable para cada {{n}} detectado en el texto')
            return
        }
        setCreating(true)
        try {
            const template = await fetchAPI('/messaging/whatsapp/templates', {
                method: 'POST',
                body: JSON.stringify({
                    name: cleanName,
                    language,
                    category,
                    bodyText,
                    variables: detectedVariableCount > 0 ? variableMap : undefined
                })
            })
            setTemplates(prev => [template, ...prev])
            setName(''); setBodyText(''); setVariableMap([])
            toast.success('Plantilla enviada a revisión de Meta', {
                description: 'El estado cambiará a Aprobada u Rechazada en minutos u horas — usa "Sincronizar" para actualizarlo.'
            })
        } catch (err: any) {
            toast.error('No se pudo crear la plantilla', { description: err.message })
        } finally {
            setCreating(false)
        }
    }
```

Add the select list to the JSX, right after the closing `</div>` of the `tpl-body` field block (before the submit `<Button>`, currently around line 216-217):

```tsx
                    {detectedVariableCount > 0 && (
                        <div className="grid gap-1.5">
                            <Label className="text-xs">Variables detectadas</Label>
                            {Array.from({ length: detectedVariableCount }, (_, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground shrink-0">{`{{${i + 1}}}`}</span>
                                    <Select
                                        value={variableMap[i] ?? ''}
                                        onValueChange={(v) => setVariableMap(prev => {
                                            const next = [...prev]
                                            next[i] = v
                                            return next
                                        })}
                                    >
                                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Elegir variable" /></SelectTrigger>
                                        <SelectContent>
                                            {catalog.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                            ))}
                        </div>
                    )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd metria-metrics/Frontend && npx vitest run src/app/dashboard/settings/channels/__tests__/WhatsAppTemplatesPanel.variables.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add metria-metrics/Frontend/src/app/dashboard/settings/channels/WhatsAppTemplatesPanel.tsx metria-metrics/Frontend/src/app/dashboard/settings/channels/__tests__/WhatsAppTemplatesPanel.variables.test.tsx
git commit -m "feat(templates-ui): map {{n}} placeholders to catalog variables on creation"
```

---

### Task 7: Frontend — "view full template" modal

**Files:**
- Modify: `metria-metrics/Frontend/src/app/dashboard/settings/channels/WhatsAppTemplatesPanel.tsx`
- Test: `metria-metrics/Frontend/src/app/dashboard/settings/channels/__tests__/WhatsAppTemplatesPanel.viewModal.test.tsx`

**Interfaces:**
- Consumes: `WhatsAppTemplate.variables?: string[] | null` (already returned by `GET /messaging/whatsapp/templates`, now populated by Task 4), `catalog` state from Task 6 (used to resolve a variable key to its label).

- [ ] **Step 1: Write the failing test**

```tsx
// metria-metrics/Frontend/src/app/dashboard/settings/channels/__tests__/WhatsAppTemplatesPanel.viewModal.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { mockFetchAPI } = vi.hoisted(() => ({ mockFetchAPI: vi.fn() }))
vi.mock('@/lib/api', () => ({ fetchAPI: mockFetchAPI }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { WhatsAppTemplatesPanel } from '../WhatsAppTemplatesPanel'

const CATALOG = [{ key: 'contact.name', label: 'Nombre del lead', example: 'Juan Pérez' }]

const LONG_BODY = 'Hola {{1}}, este es un texto bien largo que hoy se corta en la lista y no se puede leer completo'

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchAPI.mockImplementation((endpoint: string) => {
    if (endpoint === '/messaging/whatsapp/templates/variable-catalog') return Promise.resolve({ catalog: CATALOG })
    if (endpoint === '/messaging/whatsapp/templates') {
      return Promise.resolve({
        templates: [{
          id: 't1', name: 'saludo_inicial_leads', language: 'es', category: 'MARKETING',
          bodyText: LONG_BODY, status: 'APPROVED', variables: ['contact.name']
        }],
        openingTemplateId: null, technicalVisitTemplateId: null, visitConfirmationTemplateId: null
      })
    }
    return Promise.resolve({})
  })
})

describe('WhatsAppTemplatesPanel — view modal', () => {
  it('opens a dialog with the full body text when clicking the view button', async () => {
    const user = userEvent.setup()
    render(<WhatsAppTemplatesPanel />)

    const viewButton = await screen.findByRole('button', { name: /ver plantilla saludo_inicial_leads/i })
    await user.click(viewButton)

    expect(await screen.findByText(new RegExp(LONG_BODY))).toBeInTheDocument()
    expect(screen.getByText(/Nombre del lead/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd metria-metrics/Frontend && npx vitest run src/app/dashboard/settings/channels/__tests__/WhatsAppTemplatesPanel.viewModal.test.tsx`
Expected: FAIL — no button named "Ver plantilla saludo_inicial_leads" exists yet

- [ ] **Step 3: Add the view modal**

In `metria-metrics/Frontend/src/app/dashboard/settings/channels/WhatsAppTemplatesPanel.tsx`:

Add `Eye` to the lucide-react import (line 9):

```tsx
import { RefreshCw, Trash2, MessageSquareText, Eye } from 'lucide-react'
```

Add the Dialog import right after it:

```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
```

Add `variables?: string[] | null` to the `WhatsAppTemplate` interface (line 13-21):

```tsx
interface WhatsAppTemplate {
    id: string
    name: string
    language: string
    category: string
    bodyText: string
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED'
    rejectedReason?: string | null
    variables?: string[] | null
}
```

Add state for the currently-viewed template, next to `technicalVisitTemplateId` (around line 41):

```tsx
    const [viewingTemplate, setViewingTemplate] = useState<WhatsAppTemplate | null>(null)
```

Add the "ver" button in the row actions, right before the existing delete `<Button>` (around line 271):

```tsx
                                    <Button
                                        size="icon" variant="ghost" className="h-7 w-7"
                                        aria-label={`Ver plantilla ${t.name}`}
                                        onClick={() => setViewingTemplate(t)}
                                    >
                                        <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                                    </Button>
```

Change the outer `return (` to wrap the `<Card>` in a fragment and add the `<Dialog>` after it (the component currently returns a single `<Card>...</Card>` — wrap it):

```tsx
    return (
        <>
        <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
            {/* ...unchanged Card contents... */}
        </Card>
        <Dialog open={!!viewingTemplate} onOpenChange={(open) => !open && setViewingTemplate(null)}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{viewingTemplate?.name}</DialogTitle>
                    <DialogDescription>{viewingTemplate?.language} · {viewingTemplate?.category}</DialogDescription>
                </DialogHeader>
                <p className="text-sm whitespace-pre-wrap">{viewingTemplate?.bodyText}</p>
                {viewingTemplate?.variables && viewingTemplate.variables.length > 0 && (
                    <div className="space-y-1 pt-2 border-t border-border/50">
                        <p className="text-xs font-medium text-muted-foreground">Variables</p>
                        {viewingTemplate.variables.map((key, i) => (
                            <p key={key} className="text-xs">
                                {`{{${i + 1}}}`} → {catalog.find(c => c.key === key)?.label ?? key}
                            </p>
                        ))}
                    </div>
                )}
            </DialogContent>
        </Dialog>
        </>
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd metria-metrics/Frontend && npx vitest run src/app/dashboard/settings/channels/__tests__/WhatsAppTemplatesPanel.viewModal.test.tsx`
Expected: PASS

- [ ] **Step 5: Run the full frontend test suite for this directory**

Run: `cd metria-metrics/Frontend && npx vitest run src/app/dashboard/settings/channels`
Expected: PASS (all 3 template panel test files green)

- [ ] **Step 6: Commit**

```bash
git add metria-metrics/Frontend/src/app/dashboard/settings/channels/WhatsAppTemplatesPanel.tsx metria-metrics/Frontend/src/app/dashboard/settings/channels/__tests__/WhatsAppTemplatesPanel.viewModal.test.tsx
git commit -m "feat(templates-ui): add full-text view modal for WhatsApp templates"
```

---

### Task 8: Dedicated templates page + summary card

**Files:**
- Create: `metria-metrics/Frontend/src/app/dashboard/settings/channels/templates/page.tsx`
- Create: `metria-metrics/Frontend/src/app/dashboard/settings/channels/WhatsAppTemplatesSummaryCard.tsx`
- Test: `metria-metrics/Frontend/src/app/dashboard/settings/channels/__tests__/WhatsAppTemplatesSummaryCard.test.tsx`
- Modify: `metria-metrics/Frontend/src/app/dashboard/settings/channels/ChannelCard.tsx`

**Interfaces:**
- Consumes: `GET /messaging/whatsapp/templates` (existing, unchanged shape), `WhatsAppTemplatesPanel` component (unchanged export from Task 6/7).
- Produces: route `/dashboard/settings/channels/templates`; `WhatsAppTemplatesSummaryCard` component (no props, self-fetching, same pattern as `WhatsAppTemplatesPanel`).

- [ ] **Step 1: Write the failing test**

```tsx
// metria-metrics/Frontend/src/app/dashboard/settings/channels/__tests__/WhatsAppTemplatesSummaryCard.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const { mockFetchAPI } = vi.hoisted(() => ({ mockFetchAPI: vi.fn() }))
vi.mock('@/lib/api', () => ({ fetchAPI: mockFetchAPI }))

import { WhatsAppTemplatesSummaryCard } from '../WhatsAppTemplatesSummaryCard'

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchAPI.mockResolvedValue({
    templates: [
      { id: '1', status: 'APPROVED' },
      { id: '2', status: 'APPROVED' },
      { id: '3', status: 'PENDING' },
      { id: '4', status: 'REJECTED' }
    ]
  })
})

describe('WhatsAppTemplatesSummaryCard', () => {
  it('shows the counts by status and a link to the dedicated templates page', async () => {
    render(<WhatsAppTemplatesSummaryCard />)

    expect(await screen.findByText(/4 plantilla\(s\)/i)).toBeInTheDocument()
    expect(screen.getByText(/2 aprobada\(s\)/i)).toBeInTheDocument()
    expect(screen.getByText(/1 pendiente\(s\)/i)).toBeInTheDocument()
    expect(screen.getByText(/1 rechazada\(s\)/i)).toBeInTheDocument()

    const link = screen.getByRole('link', { name: /gestionar plantillas/i })
    expect(link).toHaveAttribute('href', '/dashboard/settings/channels/templates')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd metria-metrics/Frontend && npx vitest run src/app/dashboard/settings/channels/__tests__/WhatsAppTemplatesSummaryCard.test.tsx`
Expected: FAIL — `Cannot find module '../WhatsAppTemplatesSummaryCard'`

- [ ] **Step 3: Create the summary card component**

```tsx
// metria-metrics/Frontend/src/app/dashboard/settings/channels/WhatsAppTemplatesSummaryCard.tsx
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MessageSquareText, ArrowRight } from 'lucide-react'
import { fetchAPI } from '@/lib/api'

interface TemplateCounts {
    total: number
    approved: number
    pending: number
    rejected: number
}

export const WhatsAppTemplatesSummaryCard = () => {
    const [counts, setCounts] = useState<TemplateCounts | null>(null)

    useEffect(() => {
        fetchAPI('/messaging/whatsapp/templates')
            .then(data => {
                const templates = data.templates ?? []
                setCounts({
                    total: templates.length,
                    approved: templates.filter((t: any) => t.status === 'APPROVED').length,
                    pending: templates.filter((t: any) => t.status === 'PENDING').length,
                    rejected: templates.filter((t: any) => t.status === 'REJECTED').length
                })
            })
            .catch(() => setCounts({ total: 0, approved: 0, pending: 0, rejected: 0 }))
    }, [])

    return (
        <Card className="bg-card/30 backdrop-blur-xl border border-border/50">
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                    <MessageSquareText className="h-4 w-4 text-primary" />
                    Plantillas de WhatsApp (HSM)
                </CardTitle>
                <CardDescription className="text-xs mt-1">
                    {counts === null
                        ? 'Cargando...'
                        : `${counts.total} plantilla(s) — ${counts.approved} aprobada(s), ${counts.pending} pendiente(s), ${counts.rejected} rechazada(s)`}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Button asChild size="sm" variant="outline" className="gap-1.5 h-8 text-xs w-full">
                    <Link href="/dashboard/settings/channels/templates">
                        Gestionar plantillas
                        <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                </Button>
            </CardContent>
        </Card>
    )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd metria-metrics/Frontend && npx vitest run src/app/dashboard/settings/channels/__tests__/WhatsAppTemplatesSummaryCard.test.tsx`
Expected: PASS

- [ ] **Step 5: Create the dedicated page**

```tsx
// metria-metrics/Frontend/src/app/dashboard/settings/channels/templates/page.tsx
import type { Metadata } from 'next'
import { WhatsAppTemplatesPanel } from '../WhatsAppTemplatesPanel'

export const metadata: Metadata = {
    title: 'Plantillas de WhatsApp | Metria',
    description: 'Crea, revisa y asigna las plantillas HSM de WhatsApp del workspace'
}

export default function WhatsAppTemplatesPage() {
    return (
        <div className="container mx-auto py-8 px-4 max-w-4xl space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Plantillas de WhatsApp</h1>
                <p className="text-muted-foreground">
                    Plantillas HSM aprobadas por Meta, usadas para saludo inicial, aviso de visita técnica y confirmación de visita.
                </p>
            </div>
            <WhatsAppTemplatesPanel />
        </div>
    )
}
```

- [ ] **Step 6: Wire the summary card into `ChannelCard.tsx`**

In `metria-metrics/Frontend/src/app/dashboard/settings/channels/ChannelCard.tsx`, replace the import on line 8:

```tsx
import { WhatsAppTemplatesSummaryCard } from './WhatsAppTemplatesSummaryCard'
```

Replace the usage on line 157 (`<WhatsAppTemplatesPanel />`) with:

```tsx
                    <WhatsAppTemplatesSummaryCard />
```

- [ ] **Step 7: Manual verification (no automated test for the Server Component page — pure composition, no logic)**

Run: `cd metria-metrics/Frontend && pnpm dev`
1. Navigate to `/dashboard/settings/channels`, confirm the WhatsApp card now shows the small summary card (counts + "Gestionar plantillas" button) instead of the full form/list.
2. Click "Gestionar plantillas", confirm it lands on `/dashboard/settings/channels/templates` with the full-width form and list.
3. Create a template with `{{1}}`, map it to "Nombre del lead", submit, confirm it appears in the list.
4. Click the eye icon on a template, confirm the modal shows the full body text and the mapped variable.
5. Try assigning a template with 2 variables as "saludo" (opening) via the role buttons if one exists with a mismatch — confirm the toast shows the mismatch error from Task 5.

- [ ] **Step 8: Run the full frontend test suite for this directory**

Run: `cd metria-metrics/Frontend && npx vitest run src/app/dashboard/settings/channels`
Expected: PASS (all template-related tests green)

- [ ] **Step 9: Commit**

```bash
git add metria-metrics/Frontend/src/app/dashboard/settings/channels/templates/page.tsx metria-metrics/Frontend/src/app/dashboard/settings/channels/WhatsAppTemplatesSummaryCard.tsx metria-metrics/Frontend/src/app/dashboard/settings/channels/__tests__/WhatsAppTemplatesSummaryCard.test.tsx metria-metrics/Frontend/src/app/dashboard/settings/channels/ChannelCard.tsx
git commit -m "feat(templates-ui): move WhatsApp templates to a dedicated full-width page"
```
