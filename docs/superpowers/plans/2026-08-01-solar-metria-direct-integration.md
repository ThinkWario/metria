# Integración directa Solar ↔ Metria — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el webhook de Google Apps Script como pivote entre solar (quote wizard de DrillChile) y Metria por un endpoint REST directo en el Backend de Metria, en tiempo real, sin monorepo ni DB compartida.

**Architecture:** Nuevo endpoint público `POST/GET /api/public/solar/lead` en el Backend de Metria, autenticado con una API key fija (single-tenant, DrillChile). La lógica de negocio por-lead (dedupe, consentimiento, calificación, Deal, eventos Meta CAPI, handoff WhatsApp) vive en `leadIngestion.service.ts`, nueva, y reutiliza los emisores de CAPI (`meta-events/metaEvents.service.ts`) que ya existen y ya dedupean a nivel de base de datos. solar (`C:\repo\drillchile\solar`, repo aparte) cambia `src/app/actions.ts` para apuntar a este endpoint en vez de `GS_WEBHOOK_URL` — sin tocar ningún componente de UI.

**Tech Stack:** Express 4, Prisma 5 (Postgres), Vitest + Supertest (tests), Next.js 15 server actions (solar).

## Global Constraints

- Spec de referencia: `docs/superpowers/specs/2026-08-01-solar-metria-direct-integration-design.md` — cualquier ambigüedad se resuelve releyendo ese documento primero.
- Single-tenant: todo hardcodeado al workspace de DrillChile vía env vars (`SOLAR_WORKSPACE_ID`, etc.) — no construir UI de configuración ni mapeo de columnas para esto.
- Sin monorepo, sin Prisma client compartido entre `Backend/` y `C:\repo\drillchile\solar` — el único contrato es el JSON del endpoint.
- **Descubrimiento importante que corrige al spec**: `Contact` ya tiene `@@unique([workspaceId, source, sessionId])` en `Backend/prisma/schema.prisma:477` — **no hace falta migración de Prisma**. Basta con usar `source: 'solar_direct'` como constante y ese índice compuesto resuelve el upsert por sessionId de forma atómica.
- **Segundo descubrimiento que corrige al spec**: `emitConversionEvent` (`Backend/src/modules/meta-events/metaEvents.capi.ts:121-134`) ya atrapa `P2002` (violación del único `@@unique([pixelId, eventName, eventId])` en `ConversionEvent`) y descarta el duplicado en silencio. Esto significa que llamar dos veces a `emitMetaContactEvent`/`emitMetaLeadEvent`/`emitMetaFinanceApplicationSubmittedEvent` para el mismo lead **ya es seguro** — no hace falta un guard de idempotencia nuevo tipo `financeEventSentAt`. Esta parte del audit previo del spec estaba sobre-estimada; no se construye.
- El proyecto no usa `zod` (no está en `package.json`). Seguir la convención existente: validación manual con `if (!x) { res.status(400)...; return }`, igual que `sheets.routes.ts` y `public-forms.routes.ts`.
- Test runner: Vitest (`npm test` en `Backend/`). Mocks de Prisma vía `vi.mock('../../lib/prisma', ...)`, igual que `sheets.service.test.ts` y `public-booking.routes.test.ts`.

---

## File Structure

**Backend (este repo):**
- Create: `Backend/src/modules/leads/whatsappHandoff.ts` — helpers de handoff WhatsApp, extraídos de `sheets.service.ts` para reuso.
- Create: `Backend/src/modules/leads/solarQualifier.ts` — reglas determinísticas de calificación para el shape de `StepData` de solar.
- Create: `Backend/src/modules/leads/leadIngestion.service.ts` — `resolveOrCreatePartialContact` (save) y `finalizeLead` (complete).
- Create: `Backend/src/middleware/solarApiKey.ts` — `authenticateSolarApiKey`.
- Create: `Backend/src/modules/leads/solarLead.routes.ts` — `POST/GET /api/public/solar/lead`.
- Modify: `Backend/src/modules/sheets/sheets.service.ts` — importa `whatsappHandoff.ts` en vez de definir las funciones localmente.
- Modify: `Backend/src/app.ts` — registra el router nuevo.
- Modify: `Backend/.env.example` — nuevas env vars.
- Test: `Backend/src/modules/leads/__tests__/whatsappHandoff.test.ts`
- Test: `Backend/src/modules/leads/__tests__/solarQualifier.test.ts`
- Test: `Backend/src/modules/leads/__tests__/leadIngestion.service.test.ts`
- Test: `Backend/src/modules/leads/__tests__/solarLead.routes.test.ts`

**solar (`C:\repo\drillchile\solar`, repo aparte):**
- Modify: `src/app/actions.ts`
- Delete: `test-gs.js`
- Modify: `.env.local` (documentar, no versionado)

**Frontend (`metria-metrics/Frontend/`):**
- Modify: `src/app/dashboard/crm/contacts/[contactId]/ContactProfileClient.tsx`

---

### Task 1: Extraer helpers de handoff WhatsApp a un módulo compartido

**Files:**
- Create: `Backend/src/modules/leads/whatsappHandoff.ts`
- Modify: `Backend/src/modules/sheets/sheets.service.ts:87-205` (elimina las dos funciones locales, las importa)
- Test: correr la suite existente `Backend/src/modules/sheets/__tests__/sheets.service.test.ts` (no se crea test nuevo — es una extracción mecánica, la regresión la cubre la suite ya existente)

**Interfaces:**
- Produces: `prepareWhatsappConversation(workspaceId: string, channel: { id: string; config: unknown }, contact: { id: string; name: string; phone: string | null }, openingMessageTemplate: string | null): Promise<void>` — firma idéntica a la actual, sin cambios de comportamiento.

- [ ] **Step 1: Crear el archivo nuevo copiando las dos funciones tal cual**

Copia literal de `sheets.service.ts:87-205` (`prepareWhatsappConversation` y `sendOpeningTemplate`) a un archivo nuevo, ajustando solo los imports relativos:

```typescript
// Backend/src/modules/leads/whatsappHandoff.ts
import { prisma } from '../../lib/prisma'
import { getIO } from '../../lib/socket'
import { sendOutboundPlatformMessage } from '../messaging/message.service'
import { sendWhatsAppTemplateMessage } from '../messaging/channels/whatsapp.service'

/**
 * Starts a WhatsApp conversation for a newly-qualified lead: creates the
 * Conversation if one doesn't already exist, and — when the channel has the
 * AI closing agent enabled — sends the opening message immediately and hands
 * the conversation to the bot (isHandledByBot: true), so the same agent that
 * handles inbound WhatsApp leads (qualification, objection handling,
 * schedule_appointment tool) takes the lead from the first message through
 * booking the visita técnica. If the send fails (channel disconnected) or
 * the channel has no AI agent configured, it falls back to leaving the
 * suggested opener as an internal note for a human to send manually — the
 * lead is never silently dropped.
 *
 * externalId is built ONLY from the lead's own formatted phone number
 * (contact.phone, already validated by normalizePhone) — this is a fresh
 * outbound-initiated contact with no prior WhatsApp message, so there is no
 * lid involved anywhere in this path.
 */
export async function prepareWhatsappConversation(
  workspaceId: string,
  channel: { id: string; config: unknown },
  contact: { id: string; name: string; phone: string | null },
  openingMessageTemplate: string | null
): Promise<void> {
  if (!contact.phone) return
  const channelId = channel.id
  const externalId = `${contact.phone}@c.us`

  const existing = await prisma.conversation.findUnique({
    where: { workspaceId_channelId_externalId: { workspaceId, channelId, externalId } }
  })
  if (existing) return

  const openingMessage = (openingMessageTemplate?.trim() || 'Hola {nombre}, vimos tu interés y nos encantaría ayudarte 🙌')
    .replace(/\{nombre\}/gi, contact.name)

  const isAiEnabled = !!(channel.config as any)?.isAiEnabled

  const conversation = await prisma.conversation.create({
    data: {
      workspaceId,
      channelId,
      contactId: contact.id,
      externalId,
      status: isAiEnabled ? 'OPEN' : 'PENDING',
      isHandledByBot: isAiEnabled
    }
  })

  getIO().to(`workspace:${workspaceId}`).emit('conversation:new', {
    id: conversation.id,
    channelId,
    externalId,
    status: conversation.status,
    contact: { id: contact.id, name: contact.name },
    createdAt: conversation.createdAt
  })

  if (isAiEnabled) {
    try {
      const config = channel.config as Record<string, any>
      const isCloudApi = !config?.isNative
      if (isCloudApi && config?.openingTemplateId) {
        await sendOpeningTemplate(workspaceId, conversation.id, channelId, config, { name: contact.name, phone: contact.phone })
      } else {
        await sendOutboundPlatformMessage(workspaceId, conversation.id, openingMessage, 'BOT')
      }
      return
    } catch (err) {
      console.error(`[WhatsappHandoff] Failed to send opening WhatsApp message to contact ${contact.id}, falling back to manual note:`, err)
      await prisma.conversation.update({ where: { id: conversation.id }, data: { status: 'PENDING', isHandledByBot: false } })
    }
  }

  const note = await prisma.message.create({
    data: {
      workspaceId,
      conversationId: conversation.id,
      direction: 'OUTBOUND',
      senderType: 'SYSTEM',
      content: `💡 Sugerencia de primer mensaje (lead importado — revisa y envía manualmente):\n\n${openingMessage}`,
      isInternal: true
    }
  })

  getIO().to(`workspace:${workspaceId}`).emit('message:new', {
    id: note.id,
    conversationId: conversation.id,
    direction: 'OUTBOUND',
    senderType: 'SYSTEM',
    content: note.content,
    isInternal: true,
    sentAt: note.sentAt
  })
}

/**
 * Sends the workspace's configured opening HSM template to a fresh lead.
 * Cloud API rejects free-form text to a contact who has never messaged the
 * business number (error 131047) — a template is the only send type allowed
 * to open that first contact.
 */
async function sendOpeningTemplate(
  workspaceId: string,
  conversationId: string,
  channelId: string,
  config: Record<string, any>,
  contact: { name: string; phone: string }
): Promise<void> {
  const template = await prisma.whatsAppTemplate.findFirst({
    where: { id: config.openingTemplateId, channelId, status: 'APPROVED' }
  })
  if (!template) throw new Error(`Opening template ${config.openingTemplateId} not found or not APPROVED`)

  await sendWhatsAppTemplateMessage(
    config.phoneNumberId,
    config.accessToken,
    contact.phone,
    template.name,
    template.language,
    [contact.name]
  )

  const content = template.bodyText.replace(/\{\{1\}\}/g, contact.name)
  const message = await prisma.message.create({
    data: { workspaceId, conversationId, direction: 'OUTBOUND', senderType: 'BOT', content, status: 'SENT' }
  })
  getIO().to(`workspace:${workspaceId}`).emit('message:new', {
    id: message.id,
    conversationId,
    direction: 'OUTBOUND',
    senderType: 'BOT',
    content,
    sentAt: message.sentAt,
    status: 'SENT'
  })
}
```

- [ ] **Step 2: Borrar las dos funciones de `sheets.service.ts` e importarlas**

En `Backend/src/modules/sheets/sheets.service.ts`:
- Borra las líneas 87-205 (las dos funciones completas).
- Agrega el import junto a los demás, y borra el import de `getIO`/`sendOutboundPlatformMessage`/`sendWhatsAppTemplateMessage` si ya no se usan en otro lugar del archivo (verifica con grep antes de borrar — `syncAllActiveSheets`/`runSync` no los usan directo, solo a través de `prepareWhatsappConversation`).

```typescript
import { prepareWhatsappConversation } from '../leads/whatsappHandoff'
```

El resto de `sheets.service.ts` (la llamada `await prepareWhatsappConversation(...)` dentro de `runSync`) no cambia — misma firma, mismo comportamiento.

- [ ] **Step 3: Correr la suite existente para confirmar que no hay regresión**

Run: `cd Backend && npm test -- sheets.service.test.ts`
Expected: PASS, mismos resultados que antes de la extracción (la suite mockea `prisma`/`socket`/`message.service`/`whatsapp.service`, no le importa desde qué archivo se llama la función).

- [ ] **Step 4: Commit**

```bash
git add Backend/src/modules/leads/whatsappHandoff.ts Backend/src/modules/sheets/sheets.service.ts
git commit -m "refactor: extract WhatsApp handoff helpers into shared leads module"
```

---

### Task 2: `solarQualifier.ts` — reglas de calificación determinísticas

**Files:**
- Create: `Backend/src/modules/leads/solarQualifier.ts`
- Test: `Backend/src/modules/leads/__tests__/solarQualifier.test.ts`

**Interfaces:**
- Produces: `qualifySolarLead(data: Record<string, unknown>): { qualificationStatus: 'CALIFICA' | 'NO_CALIFICA' | 'REVISAR'; qualificationSummary: string }` — usado por `leadIngestion.service.ts` (Task 3) en `finalizeLead`.

- [ ] **Step 1: Escribir los tests que fallan**

```typescript
// Backend/src/modules/leads/__tests__/solarQualifier.test.ts
import { describe, it, expect } from 'vitest'
import { qualifySolarLead } from '../solarQualifier'

describe('qualifySolarLead', () => {
  it('califica cuando el dueño confirma techo y la boleta supera el umbral', () => {
    const result = qualifySolarLead({
      ownershipType: 'dueño', techoConfirmado: true, montoBoleta: '45000'
    })
    expect(result.qualificationStatus).toBe('CALIFICA')
  })

  it('califica también para propiedad familiar', () => {
    const result = qualifySolarLead({
      ownershipType: 'familiar', techoConfirmado: true, montoBoleta: '60000'
    })
    expect(result.qualificationStatus).toBe('CALIFICA')
  })

  it('no califica si es arrendatario', () => {
    const result = qualifySolarLead({
      ownershipType: 'arrendatario', techoConfirmado: true, montoBoleta: '80000'
    })
    expect(result.qualificationStatus).toBe('NO_CALIFICA')
  })

  it('no califica si no confirma el techo', () => {
    const result = qualifySolarLead({
      ownershipType: 'dueño', techoConfirmado: false, montoBoleta: '80000'
    })
    expect(result.qualificationStatus).toBe('NO_CALIFICA')
  })

  it('deja en revisión si la boleta está bajo el umbral', () => {
    const result = qualifySolarLead({
      ownershipType: 'dueño', techoConfirmado: true, montoBoleta: '15000'
    })
    expect(result.qualificationStatus).toBe('REVISAR')
  })

  it('deja en revisión si faltan datos', () => {
    const result = qualifySolarLead({})
    expect(result.qualificationStatus).toBe('REVISAR')
  })
})
```

- [ ] **Step 2: Correr los tests para confirmar que fallan**

Run: `cd Backend && npm test -- solarQualifier.test.ts`
Expected: FAIL con "Cannot find module '../solarQualifier'"

- [ ] **Step 3: Implementación mínima**

```typescript
// Backend/src/modules/leads/solarQualifier.ts

/**
 * Umbral de boleta eléctrica mensual (CLP) bajo el cual un lead queda en
 * REVISAR en vez de CALIFICA — un consumo bajo hace que el proyecto solar
 * no sea rentable a corto plazo. Valor inicial acordado con DrillChile;
 * ajustable sin tocar el resto del flujo.
 */
const MIN_MONTHLY_BILL_CLP = 30_000

export interface SolarQualificationResult {
  qualificationStatus: 'CALIFICA' | 'NO_CALIFICA' | 'REVISAR'
  qualificationSummary: string
}

function parseMontoBoleta(raw: unknown): number | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null
  const digits = String(raw).replace(/[^\d]/g, '')
  if (!digits) return null
  return Number(digits)
}

/**
 * Reglas determinísticas sobre el shape tipado de StepData de solar — a
 * diferencia de sheets.agent.ts (que infiere calificación vía IA sobre
 * columnas arbitrarias de una planilla), acá el shape ya es conocido, así
 * que no hace falta IA ni configuración por workspace.
 */
export function qualifySolarLead(data: Record<string, unknown>): SolarQualificationResult {
  const ownershipType = String(data.ownershipType ?? '')
  const techoConfirmado = data.techoConfirmado === true
  const montoBoleta = parseMontoBoleta(data.montoBoleta)

  const isOwnerOrFamily = ownershipType === 'dueño' || ownershipType === 'familiar'

  if (ownershipType === 'arrendatario' || !techoConfirmado) {
    return {
      qualificationStatus: 'NO_CALIFICA',
      qualificationSummary: ownershipType === 'arrendatario'
        ? 'Arrendatario — requiere autorización del propietario, no califica directamente.'
        : 'Techo no confirmado — no se puede evaluar viabilidad de instalación.'
    }
  }

  if (isOwnerOrFamily && montoBoleta !== null && montoBoleta >= MIN_MONTHLY_BILL_CLP) {
    return {
      qualificationStatus: 'CALIFICA',
      qualificationSummary: `Propietario con techo confirmado y boleta de $${montoBoleta.toLocaleString('es-CL')} — cumple los criterios básicos.`
    }
  }

  return {
    qualificationStatus: 'REVISAR',
    qualificationSummary: 'Faltan datos o la boleta está bajo el umbral mínimo — requiere revisión manual.'
  }
}
```

- [ ] **Step 4: Correr los tests para confirmar que pasan**

Run: `cd Backend && npm test -- solarQualifier.test.ts`
Expected: PASS (6/6)

- [ ] **Step 5: Commit**

```bash
git add Backend/src/modules/leads/solarQualifier.ts Backend/src/modules/leads/__tests__/solarQualifier.test.ts
git commit -m "feat(leads): add deterministic qualification rules for solar leads"
```

---

### Task 3: `leadIngestion.service.ts` — `resolveOrCreatePartialContact` (camino `save`)

**Files:**
- Create: `Backend/src/modules/leads/leadIngestion.service.ts`
- Test: `Backend/src/modules/leads/__tests__/leadIngestion.service.test.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores todavía (esta función no llama `whatsappHandoff` ni `solarQualifier`).
- Produces: `export const SOLAR_SOURCE = 'solar_direct'`; `resolveOrCreatePartialContact(workspaceId: string, payload: SolarLeadPayload): Promise<Contact>`; `export interface SolarLeadPayload { sessionId: string; name?: string; email?: string; phone?: string; consentAccepted?: boolean; consentVersion?: string; [key: string]: unknown }` — usados por Task 4 (`finalizeLead`) y Task 6 (rutas).

- [ ] **Step 1: Escribir los tests que fallan**

```typescript
// Backend/src/modules/leads/__tests__/leadIngestion.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    contact: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    }
  }
}))

import { resolveOrCreatePartialContact, SOLAR_SOURCE } from '../leadIngestion.service'
import { prisma } from '../../../lib/prisma'

const WS_ID = 'ws-1'

beforeEach(() => vi.clearAllMocks())

describe('resolveOrCreatePartialContact', () => {
  it('crea un Contact nuevo con tag Incompleto cuando el sessionId no existe', async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.contact.create).mockResolvedValue({ id: 'c1', sessionId: 'sess-1' } as any)

    await resolveOrCreatePartialContact(WS_ID, { sessionId: 'sess-1', comuna: 'Providencia' })

    expect(prisma.contact.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        workspaceId: WS_ID,
        source: SOLAR_SOURCE,
        sessionId: 'sess-1',
        status: 'LEAD',
        qualificationData: { rawFields: { sessionId: 'sess-1', comuna: 'Providencia' } },
        tags: { create: { workspaceId: WS_ID, name: 'Incompleto', color: '#f97316' } }
      })
    }))
  })

  it('usa un nombre por defecto legible cuando no llega name', async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.contact.create).mockResolvedValue({ id: 'c1' } as any)

    await resolveOrCreatePartialContact(WS_ID, { sessionId: 'abcdef1234567890' })

    expect(prisma.contact.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: 'Lead Solar (abcdef12)' })
    }))
  })

  it('mergea rawFields sobre un Contact existente sin pisar campos ya guardados con valores vacíos', async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue({
      id: 'c1',
      name: 'Lead Solar (sess-1)',
      email: null,
      phone: null,
      qualificationData: { rawFields: { sessionId: 'sess-1', comuna: 'Providencia' } }
    } as any)
    vi.mocked(prisma.contact.update).mockResolvedValue({ id: 'c1' } as any)

    await resolveOrCreatePartialContact(WS_ID, { sessionId: 'sess-1', direccion: 'Av. Siempre Viva 123', comuna: '' })

    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: expect.objectContaining({
        qualificationData: {
          rawFields: { sessionId: 'sess-1', comuna: 'Providencia', direccion: 'Av. Siempre Viva 123' }
        }
      })
    })
  })

  it('actualiza name/email/phone en el Contact existente cuando llegan por primera vez', async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue({
      id: 'c1', name: 'Lead Solar (sess-1)', email: null, phone: null,
      qualificationData: { rawFields: { sessionId: 'sess-1' } }
    } as any)
    vi.mocked(prisma.contact.update).mockResolvedValue({ id: 'c1' } as any)

    await resolveOrCreatePartialContact(WS_ID, { sessionId: 'sess-1', name: 'Roberto Pérez', phone: '+56 9 1234 5678' })

    expect(prisma.contact.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: expect.objectContaining({ name: 'Roberto Pérez', phone: '56912345678' })
    })
  })
})
```

- [ ] **Step 2: Correr los tests para confirmar que fallan**

Run: `cd Backend && npm test -- leadIngestion.service.test.ts`
Expected: FAIL con "Cannot find module '../leadIngestion.service'"

- [ ] **Step 3: Implementación mínima**

```typescript
// Backend/src/modules/leads/leadIngestion.service.ts
import type { Contact } from '@prisma/client'
import { prisma } from '../../lib/prisma'
import { normalizePhone } from '../../lib/phoneFormat'

export const SOLAR_SOURCE = 'solar_direct'

export interface SolarLeadPayload {
  sessionId: string
  name?: string
  email?: string
  phone?: string
  consentAccepted?: boolean
  consentVersion?: string
  metaFbc?: string
  metaFbp?: string
  clientIpAddress?: string
  clientUserAgent?: string
  [key: string]: unknown
}

function findContactBySession(workspaceId: string, sessionId: string) {
  return prisma.contact.findUnique({
    where: { workspaceId_source_sessionId: { workspaceId, source: SOLAR_SOURCE, sessionId } }
  })
}

/**
 * `save` path: called once per wizard step. Creates the partial Contact on
 * first call (tagged Incompleto), merges new fields into
 * qualificationData.rawFields on every subsequent call for the same
 * sessionId — sheets.service.ts never had this merge behavior (it only
 * ever creates once per sessionId), this is genuinely new logic.
 */
export async function resolveOrCreatePartialContact(
  workspaceId: string,
  payload: SolarLeadPayload
): Promise<Contact> {
  const existing = await findContactBySession(workspaceId, payload.sessionId)
  const phone = payload.phone ? normalizePhone(payload.phone) : null

  if (!existing) {
    return prisma.contact.create({
      data: {
        workspaceId,
        source: SOLAR_SOURCE,
        sessionId: payload.sessionId,
        name: payload.name?.trim() || `Lead Solar (${payload.sessionId.slice(0, 8)})`,
        email: payload.email?.trim() || null,
        phone: phone || null,
        status: 'LEAD',
        qualificationData: { rawFields: payload },
        tags: { create: { workspaceId, name: 'Incompleto', color: '#f97316' } }
      }
    })
  }

  const existingRawFields = ((existing.qualificationData as any)?.rawFields ?? {}) as Record<string, unknown>
  const incomingFields = Object.fromEntries(
    Object.entries(payload).filter(([, v]) => v !== undefined && v !== '')
  )
  const mergedRawFields = { ...existingRawFields, ...incomingFields }

  return prisma.contact.update({
    where: { id: existing.id },
    data: {
      ...(payload.name?.trim() ? { name: payload.name.trim() } : {}),
      ...(payload.email?.trim() ? { email: payload.email.trim() } : {}),
      ...(phone ? { phone } : {}),
      qualificationData: { rawFields: mergedRawFields }
    }
  })
}
```

- [ ] **Step 4: Correr los tests para confirmar que pasan**

Run: `cd Backend && npm test -- leadIngestion.service.test.ts`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add Backend/src/modules/leads/leadIngestion.service.ts Backend/src/modules/leads/__tests__/leadIngestion.service.test.ts
git commit -m "feat(leads): add save-path partial Contact resolution for solar leads"
```

---

### Task 4: `leadIngestion.service.ts` — `finalizeLead` (camino `complete`)

**Files:**
- Modify: `Backend/src/modules/leads/leadIngestion.service.ts` (agrega `finalizeLead`)
- Modify: `Backend/src/modules/leads/__tests__/leadIngestion.service.test.ts` (agrega describe block)

**Interfaces:**
- Consumes: `qualifySolarLead` (Task 2), `prepareWhatsappConversation` (Task 1), `emitMetaContactEvent`/`emitMetaLeadEvent`/`emitMetaFinanceApplicationSubmittedEvent` de `Backend/src/modules/meta-events/metaEvents.service.ts` (ya existen, firmas en el header de esta task).
- Produces: `export interface FinalizeLeadResult { ok: boolean; status?: number; error?: string; contact?: Contact }`; `finalizeLead(workspaceId: string, payload: SolarLeadPayload): Promise<FinalizeLeadResult>` — usado por Task 6 (rutas).

Firmas consumidas (ya existentes, no se tocan):
```typescript
emitMetaContactEvent(workspaceId: string, contact: ContactLike, actionSource: ActionSource, customData?: Record<string, string|number|boolean>, sessionId?: string): Promise<void>
emitMetaLeadEvent(workspaceId: string, contact: ContactLike, actionSource: ActionSource, customData?: Record<string, string|number|boolean>, sessionId?: string): Promise<void>
emitMetaFinanceApplicationSubmittedEvent(workspaceId: string, contact: ContactLike, actionSource: ActionSource, sessionId?: string): Promise<void>
// ActionSource es un string literal type — usar 'system_generated', igual que sheets.service.ts
```

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al mismo archivo de Task 3 (`leadIngestion.service.test.ts`), extendiendo los mocks existentes:

```typescript
// Agregar a los imports/mocks al inicio del archivo (reemplaza el bloque vi.mock('../../../lib/prisma', ...) existente por esta versión ampliada):
vi.mock('../../../lib/prisma', () => ({
  prisma: {
    contact: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    contactTag: { deleteMany: vi.fn() },
    deal: { findFirst: vi.fn(), create: vi.fn() },
    channel: { findFirst: vi.fn() }
  }
}))
vi.mock('../solarQualifier', () => ({
  qualifySolarLead: vi.fn(() => ({ qualificationStatus: 'CALIFICA', qualificationSummary: 'ok' }))
}))
vi.mock('../whatsappHandoff', () => ({
  prepareWhatsappConversation: vi.fn(async () => {})
}))
vi.mock('../../meta-events/metaEvents.service', () => ({
  emitMetaContactEvent: vi.fn(async () => {}),
  emitMetaLeadEvent: vi.fn(async () => {}),
  emitMetaFinanceApplicationSubmittedEvent: vi.fn(async () => {})
}))

// Agregar el import de finalizeLead junto al de resolveOrCreatePartialContact:
import { finalizeLead } from '../leadIngestion.service'
import { qualifySolarLead } from '../solarQualifier'
import { prepareWhatsappConversation } from '../whatsappHandoff'
import { emitMetaContactEvent, emitMetaLeadEvent, emitMetaFinanceApplicationSubmittedEvent } from '../../meta-events/metaEvents.service'

// Agregar como nuevo describe block al final del archivo:
describe('finalizeLead', () => {
  it('rechaza con 422 si consentAccepted no es true', async () => {
    const result = await finalizeLead(WS_ID, { sessionId: 'sess-1', consentAccepted: false } as any)
    expect(result).toEqual({ ok: false, status: 422, error: expect.any(String) })
    expect(prisma.contact.findUnique).not.toHaveBeenCalled()
  })

  it('rechaza con 409 si el email ya pertenece a otro Contact distinto al de la sesión', async () => {
    vi.mocked(prisma.contact.findUnique)
      .mockResolvedValueOnce({ id: 'c-session', email: null, phone: null, qualificationData: {} } as any) // by sessionId
      .mockResolvedValueOnce({ id: 'c-other', email: 'roberto@test.cl' } as any) // by email

    const result = await finalizeLead(WS_ID, {
      sessionId: 'sess-1', consentAccepted: true, email: 'roberto@test.cl'
    } as any)

    expect(result.ok).toBe(false)
    expect(result.status).toBe(409)
  })

  it('finaliza un lead nuevo: quita tag Incompleto, califica, crea Deal, dispara CAPI y handoff WhatsApp', async () => {
    vi.mocked(prisma.contact.findUnique)
      .mockResolvedValueOnce({
        id: 'c1', name: 'Lead Solar (sess-1)', email: null, phone: null,
        qualificationData: { rawFields: { sessionId: 'sess-1', montoBoleta: '45000' } }
      } as any) // by sessionId
      .mockResolvedValueOnce(null) // by email
      .mockResolvedValueOnce(null) // by phone
    vi.mocked(prisma.contact.update).mockResolvedValue({
      id: 'c1', name: 'Roberto Pérez', phone: '56912345678', email: null
    } as any)
    vi.mocked(prisma.deal.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.deal.create).mockResolvedValue({ id: 'd1' } as any)
    vi.mocked(prisma.channel.findFirst).mockResolvedValue(null) // sin canal WhatsApp conectado

    const result = await finalizeLead(WS_ID, {
      sessionId: 'sess-1', consentAccepted: true, consentVersion: 'v1',
      name: 'Roberto Pérez', phone: '+56 9 1234 5678', montoBoleta: '45000'
    } as any)

    expect(result.ok).toBe(true)
    expect(prisma.contactTag.deleteMany).toHaveBeenCalledWith({ where: { contactId: 'c1', name: 'Incompleto' } })
    expect(qualifySolarLead).toHaveBeenCalled()
    // CALIFICA (mockeado arriba) debe persistirse como leadTemperature HOT y
    // quedar en qualificationData — es lo que el Contact profile (Task 9) lee.
    expect(prisma.contact.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'c1' },
      data: expect.objectContaining({
        leadTemperature: 'HOT',
        qualificationData: expect.objectContaining({
          qualificationStatus: 'CALIFICA',
          qualificationSummary: 'ok'
        })
      })
    }))
    expect(prisma.deal.create).toHaveBeenCalled()
    expect(emitMetaContactEvent).toHaveBeenCalled()
    expect(emitMetaLeadEvent).toHaveBeenCalled()
    expect(emitMetaFinanceApplicationSubmittedEvent).not.toHaveBeenCalled()
    expect(prepareWhatsappConversation).not.toHaveBeenCalled() // sin canal conectado
  })

  it('dispara FinanceApplicationSubmitted cuando el payload trae datos de financiamiento', async () => {
    vi.mocked(prisma.contact.findUnique)
      .mockResolvedValueOnce({ id: 'c1', name: 'x', email: null, phone: null, qualificationData: { rawFields: {} } } as any)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
    vi.mocked(prisma.contact.update).mockResolvedValue({ id: 'c1', name: 'x', phone: null, email: null } as any)
    vi.mocked(prisma.deal.findFirst).mockResolvedValue({ id: 'd1' } as any)
    vi.mocked(prisma.channel.findFirst).mockResolvedValue(null)

    await finalizeLead(WS_ID, {
      sessionId: 'sess-2', consentAccepted: true, ingresoMensual: '900000', edad: '35'
    } as any)

    expect(emitMetaFinanceApplicationSubmittedEvent).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Correr los tests para confirmar que fallan**

Run: `cd Backend && npm test -- leadIngestion.service.test.ts`
Expected: FAIL — `finalizeLead` no existe todavía.

- [ ] **Step 3: Implementación**

Agregar al final de `Backend/src/modules/leads/leadIngestion.service.ts` (y ampliar los imports del inicio del archivo):

```typescript
// Agregar a los imports existentes en leadIngestion.service.ts:
import { qualifySolarLead } from './solarQualifier'
import { prepareWhatsappConversation } from './whatsappHandoff'
import { emitMetaContactEvent, emitMetaLeadEvent, emitMetaFinanceApplicationSubmittedEvent } from '../meta-events/metaEvents.service'

const SOLAR_PIPELINE_ID = process.env.SOLAR_PIPELINE_ID ?? ''
const SOLAR_STAGE_ID = process.env.SOLAR_STAGE_ID ?? ''

const FINANCING_FIELDS = ['edad', 'estadoCivil', 'valorCasa', 'deudaCasa', 'ingresoMensual', 'profesion', 'deudaContribuciones', 'embargoVigente']

function isFinancingApplication(payload: SolarLeadPayload): boolean {
  return FINANCING_FIELDS.some(f => {
    const v = payload[f]
    return typeof v === 'string' && v.trim().length > 0
  })
}

export interface FinalizeLeadResult {
  ok: boolean
  status?: number
  error?: string
  contact?: Contact
}

/**
 * `complete` path — the wizard's submit moment. Re-validates consent
 * server-side (never trusts the client's own 422 gate), resolves the
 * session's partial Contact (or creates one if `complete` arrives without a
 * prior `save`), detects a genuine identity conflict (the email/phone now
 * known belongs to a DIFFERENT existing Contact than the one tied to this
 * sessionId), qualifies, ensures a Deal, and fires Meta CAPI + WhatsApp
 * handoff. CAPI calls are safe to make even on a retried `complete` —
 * emitConversionEvent dedupes on (pixelId, eventName, eventId) at the DB
 * level (metaEvents.capi.ts), so no extra idempotency guard is needed here.
 */
export async function finalizeLead(
  workspaceId: string,
  payload: SolarLeadPayload
): Promise<FinalizeLeadResult> {
  if (payload.consentAccepted !== true) {
    return { ok: false, status: 422, error: 'consentAccepted es requerido para completar el lead' }
  }

  const bySession = await findContactBySession(workspaceId, payload.sessionId)
  const email = payload.email?.trim() || null
  const phone = payload.phone ? normalizePhone(payload.phone) : null

  const byEmail = email
    ? await prisma.contact.findUnique({ where: { workspaceId_email: { workspaceId, email } } })
    : null
  const byPhone = phone
    ? await prisma.contact.findUnique({ where: { workspaceId_phone: { workspaceId, phone } } })
    : null

  const conflicting = [byEmail, byPhone].find(c => c && c.id !== bySession?.id)
  if (conflicting) {
    return {
      ok: false, status: 409,
      error: `El email/teléfono de este lead ya pertenece a otro contacto (${conflicting.id}) — requiere resolución manual`
    }
  }

  const existingRawFields = bySession ? ((bySession.qualificationData as any)?.rawFields ?? {}) : {}
  const mergedRawFields = { ...existingRawFields, ...payload }

  // Computed BEFORE writing the Contact so qualificationStatus/leadTemperature
  // land in the same create/update call — the Contact profile (Task 9) reads
  // qualificationData.qualificationStatus + qualificationSummary directly,
  // never re-derives them, so they must be persisted, not just computed.
  const qualResult = qualifySolarLead(mergedRawFields)
  const leadTemperature = qualResult.qualificationStatus === 'CALIFICA' ? 'HOT'
    : qualResult.qualificationStatus === 'REVISAR' ? 'WARM' : 'COLD'
  const qualificationData = {
    rawFields: mergedRawFields,
    qualificationStatus: qualResult.qualificationStatus,
    qualificationSummary: qualResult.qualificationSummary
  }

  const contact = bySession
    ? await prisma.contact.update({
        where: { id: bySession.id },
        data: {
          ...(payload.name?.trim() ? { name: payload.name.trim() } : {}),
          ...(email ? { email } : {}),
          ...(phone ? { phone } : {}),
          qualificationData,
          leadTemperature,
          consentVersion: payload.consentVersion ?? null,
          consentAt: new Date(),
          consentStatus: 'granted',
          ...(payload.metaFbc ? { fbc: payload.metaFbc } : {}),
          ...(payload.metaFbp ? { fbp: payload.metaFbp } : {}),
          ...(payload.clientIpAddress ? { clientIpAddress: payload.clientIpAddress } : {}),
          ...(payload.clientUserAgent ? { clientUserAgent: payload.clientUserAgent } : {})
        }
      })
    : await prisma.contact.create({
        data: {
          workspaceId,
          source: SOLAR_SOURCE,
          sessionId: payload.sessionId,
          name: payload.name?.trim() || `Lead Solar (${payload.sessionId.slice(0, 8)})`,
          email, phone,
          status: 'LEAD',
          qualificationData,
          leadTemperature,
          consentVersion: payload.consentVersion ?? null,
          consentAt: new Date(),
          consentStatus: 'granted',
          fbc: payload.metaFbc ?? null,
          fbp: payload.metaFbp ?? null,
          clientIpAddress: payload.clientIpAddress ?? null,
          clientUserAgent: payload.clientUserAgent ?? null
        }
      })

  await prisma.contactTag.deleteMany({ where: { contactId: contact.id, name: 'Incompleto' } })

  const existingDeal = await prisma.deal.findFirst({ where: { contactId: contact.id, pipelineId: SOLAR_PIPELINE_ID } })
  if (!existingDeal) {
    await prisma.deal.create({
      data: {
        workspaceId, contactId: contact.id, pipelineId: SOLAR_PIPELINE_ID, stageId: SOLAR_STAGE_ID,
        title: `Lead Solar - ${contact.name}`, value: 0, currency: 'CLP', status: 'OPEN'
      }
    })
  }

  emitMetaContactEvent(workspaceId, contact, 'system_generated', undefined, payload.sessionId)
    .catch(err => console.error('[LeadIngestion] Contact event failed:', err))
  emitMetaLeadEvent(workspaceId, contact, 'system_generated', undefined, payload.sessionId)
    .catch(err => console.error('[LeadIngestion] Lead event failed:', err))

  if (isFinancingApplication(payload)) {
    emitMetaFinanceApplicationSubmittedEvent(workspaceId, contact, 'system_generated', payload.sessionId)
      .catch(err => console.error('[LeadIngestion] FinanceApplicationSubmitted event failed:', err))
  }

  if (phone) {
    const whatsappChannel = await prisma.channel.findFirst({
      where: { workspaceId, platform: 'WHATSAPP', status: 'CONNECTED' },
      select: { id: true, config: true }
    })
    if (whatsappChannel) {
      try {
        await prepareWhatsappConversation(workspaceId, whatsappChannel, contact, null)
      } catch (err) {
        console.error(`[LeadIngestion] Failed to prepare WhatsApp conversation for contact ${contact.id}:`, err)
      }
    }
  }

  return { ok: true, contact }
}
```

- [ ] **Step 4: Correr los tests para confirmar que pasan**

Run: `cd Backend && npm test -- leadIngestion.service.test.ts`
Expected: PASS (9/9 — 4 de Task 3 + 5 de este task)

- [ ] **Step 5: Commit**

```bash
git add Backend/src/modules/leads/leadIngestion.service.ts Backend/src/modules/leads/__tests__/leadIngestion.service.test.ts
git commit -m "feat(leads): add finalizeLead — consent gate, conflict detection, CAPI, WhatsApp handoff"
```

---

### Task 5: Middleware `authenticateSolarApiKey`

**Files:**
- Create: `Backend/src/middleware/solarApiKey.ts`
- Test: `Backend/src/middleware/__tests__/solarApiKey.test.ts`

**Interfaces:**
- Produces: `authenticateSolarApiKey(req: Request, res: Response, next: NextFunction): void` — usado por Task 6.

- [ ] **Step 1: Escribir el test que falla**

```typescript
// Backend/src/middleware/__tests__/solarApiKey.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { authenticateSolarApiKey } from '../solarApiKey'

const originalEnv = process.env.SOLAR_API_KEY

beforeEach(() => { process.env.SOLAR_API_KEY = 'test-key-123' })
afterEach(() => { process.env.SOLAR_API_KEY = originalEnv })

function mockReqRes(headerValue?: string) {
  const req: any = { header: vi.fn(() => headerValue) }
  const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() }
  const next = vi.fn()
  return { req, res, next }
}

describe('authenticateSolarApiKey', () => {
  it('llama next() cuando el header coincide con SOLAR_API_KEY', () => {
    const { req, res, next } = mockReqRes('test-key-123')
    authenticateSolarApiKey(req, res, next)
    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('responde 401 cuando el header no coincide', () => {
    const { req, res, next } = mockReqRes('wrong-key')
    authenticateSolarApiKey(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('responde 401 cuando falta el header', () => {
    const { req, res, next } = mockReqRes(undefined)
    authenticateSolarApiKey(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
  })
})
```

- [ ] **Step 2: Correr para confirmar que falla**

Run: `cd Backend && npm test -- solarApiKey.test.ts`
Expected: FAIL con "Cannot find module '../solarApiKey'"

- [ ] **Step 3: Implementación**

```typescript
// Backend/src/middleware/solarApiKey.ts
import type { Request, Response, NextFunction } from 'express'

export function authenticateSolarApiKey(req: Request, res: Response, next: NextFunction): void {
  const key = req.header('X-Solar-Api-Key')
  if (!key || key !== process.env.SOLAR_API_KEY) {
    res.status(401).json({ error: 'No autorizado' })
    return
  }
  next()
}
```

- [ ] **Step 4: Correr para confirmar que pasa**

Run: `cd Backend && npm test -- solarApiKey.test.ts`
Expected: PASS (3/3)

- [ ] **Step 5: Commit**

```bash
git add Backend/src/middleware/solarApiKey.ts Backend/src/middleware/__tests__/solarApiKey.test.ts
git commit -m "feat(leads): add API key auth middleware for the public solar endpoint"
```

---

### Task 6: `solarLead.routes.ts` — endpoint público, registrarlo en `app.ts`

**Files:**
- Create: `Backend/src/modules/leads/solarLead.routes.ts`
- Modify: `Backend/src/app.ts`
- Test: `Backend/src/modules/leads/__tests__/solarLead.routes.test.ts`

**Interfaces:**
- Consumes: `resolveOrCreatePartialContact`, `finalizeLead`, `SOLAR_SOURCE` (Tasks 3-4), `authenticateSolarApiKey` (Task 5), `simpleRateLimit` (ya existe en `Backend/src/lib/rateLimit.ts`).
- Produces: rutas HTTP `POST /api/public/solar/lead`, `GET /api/public/solar/lead`.

- [ ] **Step 1: Escribir los tests que fallan**

```typescript
// Backend/src/modules/leads/__tests__/solarLead.routes.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

vi.mock('../../../lib/rateLimit', () => ({
  simpleRateLimit: () => (_req: any, _res: any, next: any) => next()
}))
vi.mock('../leadIngestion.service', () => ({
  resolveOrCreatePartialContact: vi.fn(async () => ({ id: 'c1' })),
  finalizeLead: vi.fn(async () => ({ ok: true, contact: { id: 'c1' } })),
  SOLAR_SOURCE: 'solar_direct'
}))
vi.mock('../../../lib/prisma', () => ({
  prisma: { contact: { findUnique: vi.fn() } }
}))

import solarLeadRouter from '../solarLead.routes'
import { resolveOrCreatePartialContact, finalizeLead } from '../leadIngestion.service'
import { prisma } from '../../../lib/prisma'

function buildApp() {
  process.env.SOLAR_API_KEY = 'test-key'
  process.env.SOLAR_WORKSPACE_ID = 'ws-1'
  const app = express()
  app.use(express.json())
  app.use('/api/public', solarLeadRouter)
  return app
}

beforeEach(() => vi.clearAllMocks())

describe('POST /api/public/solar/lead', () => {
  it('responde 401 sin API key', async () => {
    const res = await request(buildApp())
      .post('/api/public/solar/lead')
      .send({ action: 'save', sessionId: 'sess-1' })
    expect(res.status).toBe(401)
  })

  it('responde 400 sin sessionId', async () => {
    const res = await request(buildApp())
      .post('/api/public/solar/lead')
      .set('X-Solar-Api-Key', 'test-key')
      .send({ action: 'save' })
    expect(res.status).toBe(400)
  })

  it('action=save llama resolveOrCreatePartialContact y responde 200', async () => {
    const res = await request(buildApp())
      .post('/api/public/solar/lead')
      .set('X-Solar-Api-Key', 'test-key')
      .send({ action: 'save', sessionId: 'sess-1', comuna: 'Providencia' })

    expect(res.status).toBe(200)
    expect(resolveOrCreatePartialContact).toHaveBeenCalledWith('ws-1', expect.objectContaining({ sessionId: 'sess-1' }))
  })

  it('action=complete llama finalizeLead y responde 200 cuando ok', async () => {
    const res = await request(buildApp())
      .post('/api/public/solar/lead')
      .set('X-Solar-Api-Key', 'test-key')
      .send({ action: 'complete', sessionId: 'sess-1', consentAccepted: true })

    expect(res.status).toBe(200)
    expect(finalizeLead).toHaveBeenCalled()
  })

  it('action=complete propaga el status de error de finalizeLead (422 sin consentimiento)', async () => {
    vi.mocked(finalizeLead).mockResolvedValueOnce({ ok: false, status: 422, error: 'consentAccepted es requerido' })

    const res = await request(buildApp())
      .post('/api/public/solar/lead')
      .set('X-Solar-Api-Key', 'test-key')
      .send({ action: 'complete', sessionId: 'sess-1', consentAccepted: false })

    expect(res.status).toBe(422)
  })
})

describe('GET /api/public/solar/lead', () => {
  it('responde 404 si no hay Contact para ese sessionId', async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue(null)

    const res = await request(buildApp())
      .get('/api/public/solar/lead?sessionId=sess-1')
      .set('X-Solar-Api-Key', 'test-key')

    expect(res.status).toBe(404)
  })

  it('responde los rawFields guardados cuando existe', async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue({
      qualificationData: { rawFields: { comuna: 'Providencia' } }
    } as any)

    const res = await request(buildApp())
      .get('/api/public/solar/lead?sessionId=sess-1')
      .set('X-Solar-Api-Key', 'test-key')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'success', data: { comuna: 'Providencia' }, step: 1 })
  })
})
```

- [ ] **Step 2: Correr para confirmar que fallan**

Run: `cd Backend && npm test -- solarLead.routes.test.ts`
Expected: FAIL con "Cannot find module '../solarLead.routes'"

- [ ] **Step 3: Implementación**

```typescript
// Backend/src/modules/leads/solarLead.routes.ts
import { Router } from 'express'
import type { Request, Response } from 'express'
import { simpleRateLimit } from '../../lib/rateLimit'
import { authenticateSolarApiKey } from '../../middleware/solarApiKey'
import { resolveOrCreatePartialContact, finalizeLead, SOLAR_SOURCE } from './leadIngestion.service'
import { prisma } from '../../lib/prisma'

const router = Router()

function getWorkspaceId(): string {
  return process.env.SOLAR_WORKSPACE_ID ?? ''
}

// 30 requests/min por IP — un wizard normal hace unas 10 llamadas de save,
// esto deja margen sin abrir la puerta a abuso del endpoint público.
router.post('/solar/lead', authenticateSolarApiKey, simpleRateLimit(60 * 1000, 30), async (req: Request, res: Response): Promise<void> => {
  try {
    const { action, sessionId } = req.body ?? {}
    if (!sessionId || typeof sessionId !== 'string') {
      res.status(400).json({ error: 'sessionId requerido' })
      return
    }

    if (action === 'save') {
      await resolveOrCreatePartialContact(getWorkspaceId(), req.body)
      res.json({ status: 'success' })
      return
    }

    if (action === 'complete') {
      const result = await finalizeLead(getWorkspaceId(), req.body)
      if (!result.ok) {
        res.status(result.status ?? 400).json({ error: result.error })
        return
      }
      res.json({ status: 'success' })
      return
    }

    res.status(400).json({ error: 'action debe ser "save" o "complete"' })
  } catch (err: any) {
    console.error('[SolarLead] Error en POST:', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

router.get('/solar/lead', authenticateSolarApiKey, simpleRateLimit(60 * 1000, 30), async (req: Request, res: Response): Promise<void> => {
  try {
    const sessionId = String(req.query.sessionId ?? '')
    if (!sessionId) {
      res.status(400).json({ error: 'sessionId requerido' })
      return
    }

    const contact = await prisma.contact.findUnique({
      where: { workspaceId_source_sessionId: { workspaceId: getWorkspaceId(), source: SOLAR_SOURCE, sessionId } }
    })
    if (!contact) {
      res.status(404).json({ error: 'No encontrado' })
      return
    }

    const rawFields = ((contact.qualificationData as any)?.rawFields ?? {}) as Record<string, unknown>
    res.json({ status: 'success', data: rawFields, step: (rawFields.step as number) ?? 1 })
  } catch (err: any) {
    console.error('[SolarLead] Error en GET:', err)
    res.status(500).json({ error: 'Error interno' })
  }
})

export default router
```

Registrar en `Backend/src/app.ts` (junto a los demás imports/registros de `/api/public`):

```typescript
// Import, junto a los otros imports de modules/leads o cerca de sheetsRoutes:
import solarLeadRoutes from './modules/leads/solarLead.routes'

// Registro, junto a las otras líneas app.use('/api/public', ...):
app.use('/api/public', solarLeadRoutes)
```

- [ ] **Step 4: Correr para confirmar que pasan**

Run: `cd Backend && npm test -- solarLead.routes.test.ts`
Expected: PASS (7/7)

- [ ] **Step 5: Correr toda la suite del Backend para confirmar cero regresiones**

Run: `cd Backend && npm test`
Expected: PASS en todos los archivos, incluyendo `sheets.service.test.ts` (Task 1) y el resto de la suite preexistente.

- [ ] **Step 6: Commit**

```bash
git add Backend/src/modules/leads/solarLead.routes.ts Backend/src/modules/leads/__tests__/solarLead.routes.test.ts Backend/src/app.ts
git commit -m "feat(leads): expose POST/GET /api/public/solar/lead endpoint"
```

---

### Task 7: Variables de entorno del Backend

**Files:**
- Modify: `Backend/.env.example`

**Interfaces:** ninguna — solo documentación de configuración.

- [ ] **Step 1: Agregar las variables nuevas**

Agregar al final de `Backend/.env.example` (o junto a las variables de Shopify/Meta existentes, siguiendo el orden del archivo):

```bash
# Solar (DrillChile quote wizard) — integración directa, reemplaza Google Sheets
SOLAR_API_KEY=
SOLAR_WORKSPACE_ID=
SOLAR_PIPELINE_ID=
SOLAR_STAGE_ID=
```

- [ ] **Step 2: Buscar los IDs reales de pipeline/stage del `SheetIntegration` actual de DrillChile**

Run (contra la base de datos de producción o vía `db:studio`):

```bash
cd Backend && npm run db:studio
```

Abrir la tabla `sheet_integrations`, filtrar por el workspace de DrillChile, copiar `targetPipelineId` y `targetStageId` — esos son los valores reales a usar en `SOLAR_PIPELINE_ID`/`SOLAR_STAGE_ID` en el `.env` de producción (Easypanel), para que los Deals de solar caigan en el mismo pipeline/stage donde ya caían los importados por Sheets.

- [ ] **Step 3: Generar el valor de `SOLAR_API_KEY`**

Run:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Usar el resultado como `SOLAR_API_KEY` tanto en el `.env` de Backend (Easypanel) como en el env de solar (Task 8) — deben ser el mismo valor exacto.

- [ ] **Step 4: Commit**

```bash
git add Backend/.env.example
git commit -m "docs: document new SOLAR_* env vars for the direct lead endpoint"
```

(Los valores reales — `SOLAR_API_KEY` generado, `SOLAR_WORKSPACE_ID`/`SOLAR_PIPELINE_ID`/`SOLAR_STAGE_ID` de producción — se configuran directo en Easypanel, nunca se commitean.)

---

### Task 8: solar (`C:\repo\drillchile\solar`) — cambiar `actions.ts` para llamar a Metria en vez de Google Sheets

**Files:**
- Modify: `C:\repo\drillchile\solar\src\app\actions.ts`
- Delete: `C:\repo\drillchile\solar\test-gs.js`
- Modify: `C:\repo\drillchile\solar\.env.local` (no versionado — documentar el cambio, no commitear valores)

**Interfaces:** ninguna nueva — las firmas de `saveProgress`, `getLeadProgress`, `completeLead`, `getQuoteDataBySessionId`, `resetSession` no cambian, así que ningún componente de UI en solar se toca.

- [ ] **Step 1: Reemplazar la constante de webhook y agregar el header de auth**

En `C:\repo\drillchile\solar\src\app\actions.ts`, reemplazar la línea 6:

```typescript
// Antes:
const WEBHOOK_URL = process.env.GS_WEBHOOK_URL;

// Después:
const METRIA_API_URL = process.env.METRIA_API_URL; // ej: https://api.metria.com/api/public/solar/lead
const METRIA_SOLAR_API_KEY = process.env.METRIA_SOLAR_API_KEY;
```

- [ ] **Step 2: Actualizar cada función que usa `WEBHOOK_URL`**

Reemplazar cada uso de `WEBHOOK_URL` por `METRIA_API_URL`, y agregar el header `X-Solar-Api-Key` a cada `fetch`. El shape del body y de la respuesta no cambia (el endpoint de Metria devuelve `{status:'success', data, step}` en el GET, igual que Apps Script v7) — por eso las funciones no necesitan más cambios que estos:

```typescript
// saveProgress — dentro del try:
if (!sessionId || !METRIA_API_URL) return;
try {
  await fetch(METRIA_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Solar-Api-Key": METRIA_SOLAR_API_KEY ?? "" },
    body: JSON.stringify({
      action: "save",
      sessionId,
      ...stepData,
      step: step || 1,
      timestamp: new Date().toISOString()
    }),
  });
} catch (error) {
  console.error("Error saving lead progress:", error);
}
```

```typescript
// getLeadProgress — reemplaza el fetch:
if (!sessionId || !METRIA_API_URL) return null;
try {
  const res = await fetch(`${METRIA_API_URL}?sessionId=${sessionId}&t=${Date.now()}`, {
    cache: "no-store",
    headers: { "X-Solar-Api-Key": METRIA_SOLAR_API_KEY ?? "" }
  });
  if (!res.ok) return null;
  const json = await res.json();
  if (json.status === "success" && json.data) {
    return { data: json.data as StepData, step: Number(json.step || 1) };
  }
} catch (error) {
  console.error("Error fetching lead progress:", error);
}
return null;
```

```typescript
// getQuoteDataBySessionId — mismo patrón que getLeadProgress:
if (!sessionId || !METRIA_API_URL) return null;
try {
  const res = await fetch(`${METRIA_API_URL}?sessionId=${sessionId}&t=${Date.now()}`, {
    cache: "no-store",
    headers: { "X-Solar-Api-Key": METRIA_SOLAR_API_KEY ?? "" }
  });
  if (!res.ok) return null;
  const json = await res.json();
  if (json.status === "success" && json.data) {
    return json.data as StepData;
  }
} catch (error) {
  console.error("Error fetching quote by sessionId:", error);
}
return null;
```

```typescript
// completeLead — reemplaza WEBHOOK_URL por METRIA_API_URL y agrega el header:
if (!sessionId || !METRIA_API_URL) return { ok: false };
const signals = await getRequestSignals();
try {
  const res = await fetch(METRIA_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Solar-Api-Key": METRIA_SOLAR_API_KEY ?? "" },
    body: JSON.stringify({
      action: "complete",
      sessionId,
      ...finalData,
      step: totalSteps,
      metaFbc: signals.fbc,
      metaFbp: signals.fbp,
      clientIpAddress: signals.clientIpAddress,
      clientUserAgent: signals.clientUserAgent,
      status: "completed",
      timestamp: new Date().toISOString()
    }),
  });
  if (!res.ok) console.error("Error completing lead:", res.status);
  return { ok: res.ok, status: res.status };
} catch (error) {
  console.error("Error completing lead:", error);
  return { ok: false };
}
```

- [ ] **Step 3: Borrar `test-gs.js`**

```bash
cd /c/repo/drillchile/solar && rm test-gs.js
```

- [ ] **Step 4: Documentar las nuevas env vars locales (no commitear valores reales)**

En `.env.local` (archivo ya gitignorado, confirmar con `cat .gitignore | grep env`):

```bash
METRIA_API_URL=http://localhost:4000/api/public/solar/lead
METRIA_SOLAR_API_KEY=<mismo valor generado en Task 7, Step 3>
```

- [ ] **Step 5: Probar manualmente contra el Backend corriendo en local**

Con el Backend de Metria corriendo (`cd Backend && npm run dev`) y `SOLAR_API_KEY`/`SOLAR_WORKSPACE_ID`/`SOLAR_PIPELINE_ID`/`SOLAR_STAGE_ID` seteados en su `.env` local:

Run: `cd /c/repo/drillchile/solar && npm run dev`

Abrir el wizard en el navegador, completarlo hasta el final, y confirmar en los logs del Backend que no hay errores 401/422/409, y que el Contact aparece en Metria (`GET /api/crm/contacts?workspaceId=...` autenticado, o revisando `db:studio`).

- [ ] **Step 6: Commit (en el repo de solar)**

```bash
cd /c/repo/drillchile/solar
git add src/app/actions.ts
git rm test-gs.js
git commit -m "feat: call Metria's direct lead API instead of the Google Sheets webhook"
```

---

### Task 9: Visibilidad en el perfil de Contact — nuevas secciones en el Frontend

**Files:**
- Modify: `metria-metrics/Frontend/src/app/dashboard/crm/contacts/[contactId]/ContactProfileClient.tsx`

**Interfaces:** ninguna nueva de backend — `getContact` (`Backend/src/modules/crm/contact.service.ts:56-80`) ya usa `include` (no `select`), así que **ya devuelve** todos los campos escalares de `Contact` (`qualificationData`, `sessionId`, `utm*`, `meta*Id`, `fbclid`, `consentVersion/At/Status`, etc.) sin cambios de backend.

- [ ] **Step 1: Ampliar la interface `Contact` del frontend**

En `ContactProfileClient.tsx:76-86`, ampliar la interface existente:

```typescript
interface Contact {
  id: string; name: string; email: string | null; phone: string | null; status: string
  ltv: string; healthScore: number | null; source: string; createdAt: string
  leadScore: number | null; leadTemperature: string | null; leadType: string | null
  tags: { id: string; name: string; color: string }[]
  contactNotes: { id: string; content: string; createdAt: string; userId: string }[]
  deals: { id: string; title: string; value: string; status: string; stage: { name: string; color: string } }[]
  tickets: { id: string; title: string; status: string; priority: string; createdAt: string; slaDeadline: string | null }[]
  conversations: { id: string; status: string; messageCount: number; lastMessageAt: string | null; channel: { platform: string; name: string } }[]
  customFields?: Record<string, string> | null
  sessionId: string | null
  qualificationData: Record<string, unknown> | null
  utmSource: string | null; utmMedium: string | null; utmCampaign: string | null
  metaCampaignId: string | null; metaAdsetId: string | null; metaAdId: string | null
  landingUrl: string | null; referrer: string | null
  consentVersion: string | null; consentAt: string | null; consentStatus: string | null
}
```

- [ ] **Step 2: Agregar el componente `SolarLeadCard` en el mismo archivo**

Insertar antes de `export default function ContactProfileClient` (después de las constantes `TEMP_COLOR`/`LEAD_TYPE_COLOR`, línea ~72):

```tsx
const FINANCING_FIELDS: Array<[key: string, label: string]> = [
  ['edad', 'Edad'], ['estadoCivil', 'Estado civil'], ['valorCasa', 'Valor de la vivienda'],
  ['deudaCasa', 'Deuda de la vivienda'], ['ingresoMensual', 'Ingreso mensual'],
  ['profesion', 'Profesión'], ['deudaContribuciones', 'Deuda de contribuciones'], ['embargoVigente', 'Embargo vigente']
]

/**
 * Validates a URL before it's ever used as an href — houseMapUrl/meterMapUrl
 * and the quote link ultimately come from data posted to a public endpoint
 * (see solarLead.routes.ts), so they're treated as hostile input, same as
 * any other external URL rendered from stored data (react/security.md).
 */
function safeExternalUrl(url?: string | null): string | undefined {
  if (!url) return undefined
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:') return url
  } catch {
    // not a valid URL — fall through to undefined
  }
  return undefined
}

/** Solar-specific detail cards — only rendered for source === 'solar_direct'. */
function SolarLeadCard({ contact }: { contact: Contact }) {
  const raw = (contact.qualificationData?.rawFields ?? {}) as Record<string, string>
  const qualificationStatus = contact.qualificationData?.qualificationStatus as string | undefined
  const qualificationSummary = contact.qualificationData?.qualificationSummary as string | undefined
  const hasFinancing = FINANCING_FIELDS.some(([key]) => raw[key])
  const quoteUrl = contact.sessionId
    ? safeExternalUrl(`https://solar.drillchile.cl/cotizaciones?session=${contact.sessionId}`)
    : undefined
  const houseMapUrl = safeExternalUrl(raw.houseMapUrl)
  const meterMapUrl = safeExternalUrl(raw.meterMapUrl)

  return (
    <>
      {qualificationStatus && (
        <div className="rounded-lg border p-4 space-y-2 md:col-span-2">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Calificación</h3>
          <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${TEMP_COLOR[contact.leadTemperature ?? ''] ?? 'bg-gray-100 text-gray-700'}`}>
            {qualificationStatus}
          </span>
          {qualificationSummary && <p className="text-sm text-muted-foreground">{qualificationSummary}</p>}
        </div>
      )}

      <div className="rounded-lg border p-4 space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Propiedad y techo</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Field label="Tipo de propiedad" value={raw.propertyType} />
          <Field label="Tipo de tenencia" value={raw.ownershipType} />
          <Field label="Techo confirmado" value={raw.techoConfirmado === 'true' ? 'Sí' : raw.techoConfirmado === 'false' ? 'No' : undefined} />
          <Field label="Material del techo" value={raw.materialTecho} />
          <Field label="Comuna" value={raw.comuna} />
          <Field label="Dirección" value={raw.direccion} />
        </div>
        {(houseMapUrl || meterMapUrl) && (
          <div className="flex flex-wrap gap-3 pt-1 border-t text-sm">
            {houseMapUrl && (
              <a href={houseMapUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
                Ver ubicación de la casa
              </a>
            )}
            {meterMapUrl && (
              <a href={meterMapUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
                Ver ubicación del medidor
              </a>
            )}
          </div>
        )}
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Consumo eléctrico</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Field label="Monto boleta" value={raw.montoBoleta} />
          <Field label="Distribuidora" value={raw.distribuidora} />
          <Field label="Consumo horario" value={raw.consumoHorario} />
          <Field label="Empalme" value={raw.empalme} />
          <Field label="Plazo de instalación" value={raw.plazoInstalacion} />
        </div>
      </div>

      {hasFinancing && (
        <div className="rounded-lg border border-orange-300 bg-orange-50/50 p-4 space-y-3">
          <h3 className="text-sm font-medium text-orange-700 uppercase tracking-wide">Solicitud de financiamiento</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {FINANCING_FIELDS.map(([key, label]) => <Field key={key} label={label} value={raw[key]} />)}
          </div>
        </div>
      )}

      {quoteUrl && (
        <div className="rounded-lg border p-4">
          <a href={quoteUrl} target="_blank" rel="noopener noreferrer"
             className="inline-block px-3 py-1.5 text-sm rounded-lg border hover:bg-muted">
            Ver cotización
          </a>
        </div>
      )}

      <div className="rounded-lg border p-4 space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Atribución / Meta Ads</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Field label="Campaña" value={contact.metaCampaignId} />
          <Field label="Conjunto de anuncios" value={contact.metaAdsetId} />
          <Field label="Anuncio" value={contact.metaAdId} />
          <Field label="UTM source" value={contact.utmSource} />
          <Field label="UTM campaign" value={contact.utmCampaign} />
          <Field label="Landing" value={contact.landingUrl} />
        </div>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Consentimiento</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <Field label="Versión" value={contact.consentVersion} />
          <Field label="Estado" value={contact.consentStatus} />
          <Field label="Fecha" value={contact.consentAt ? new Date(contact.consentAt).toLocaleString('es-CL') : undefined} />
        </div>
      </div>
    </>
  )
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  )
}
```

- [ ] **Step 3: Renderizar `SolarLeadCard` en el tab "resumen"**

En `ContactProfileClient.tsx`, dentro del `<div className="grid grid-cols-1 md:grid-cols-2 gap-4">` (línea 435), después del cierre del bloque de "Campos personalizados" (línea 478) y antes del cierre del `</div>` del grid (línea 479):

```tsx
{contact.source === 'solar_direct' && <SolarLeadCard contact={contact} />}
```

- [ ] **Step 4: Verificar visualmente**

Run: `cd metria-metrics/Frontend && pnpm dev`

Abrir `/dashboard/crm/contacts/<id-de-un-contact-con-source-solar_direct>` en el navegador (crear uno de prueba completando el wizard de solar en local, Task 8 Step 5) y confirmar que las cards nuevas aparecen con datos reales, sin romper el layout existente en mobile (`grid-cols-1`) ni desktop (`md:grid-cols-2`).

- [ ] **Step 5: Commit**

```bash
git add metria-metrics/Frontend/src/app/dashboard/crm/contacts/\[contactId\]/ContactProfileClient.tsx
git commit -m "feat(crm): show solar lead detail (property, financing, attribution, consent) on Contact profile"
```

---

### Task 10: Corte a producción

**Files:** ninguno de código — checklist operativo.

- [ ] **Step 1: Desplegar Backend con el endpoint nuevo**

Configurar en Easypanel las env vars de Task 7 (`SOLAR_API_KEY`, `SOLAR_WORKSPACE_ID`, `SOLAR_PIPELINE_ID`, `SOLAR_STAGE_ID` con los valores reales de producción) y desplegar la rama con los Tasks 1-7 mergeados.

- [ ] **Step 2: Desplegar solar apuntando al Backend de producción**

Configurar `METRIA_API_URL=https://<dominio-backend-metria>/api/public/solar/lead` y `METRIA_SOLAR_API_KEY=<mismo valor que SOLAR_API_KEY>` en el entorno de producción de solar (Netlify/Vercel), desplegar la rama con Task 8.

- [ ] **Step 3: Ventana de verificación en paralelo**

Dejar el `SheetIntegration` de DrillChile **activo** (sigue sincronizando cada 5 min, sin tocarlo) durante 3-5 días. Completar manualmente 2-3 wizards de prueba en producción y confirmar en Metria que:
- El Contact aparece con `source: 'solar_direct'` inmediatamente (no esperar el cron).
- El Deal se crea en el pipeline/stage correctos.
- Los eventos Meta CAPI se ven en `ConversionEvent` (`status: 'sent'`).
- El handoff de WhatsApp dispara si el workspace tiene canal conectado.

- [ ] **Step 4: Desactivar el `SheetIntegration` de DrillChile**

Solo después de confirmar paridad en el Step 3 — vía UI de Metria (toggle "Activo") o `PATCH /api/sheets/:id` con `{isActive: false}`. No se borra el registro.

- [ ] **Step 5: Confirmar que el cron de Sheets sigue sano para otros clientes**

Run: revisar logs de `[SheetsSyncCron]` en producción — debe seguir corriendo cada 5 min sin errores para cualquier otra integración activa (no debería quedar ninguna después de este corte, pero el cron y el código quedan intactos para el próximo cliente que use planillas).

---

## Self-Review

**Cobertura del spec:**
- Endpoint directo reemplazando Sheets → Tasks 3, 4, 6.
- Auth por API key single-tenant → Task 5.
- Idempotencia de CAPI → cubierta por infraestructura ya existente (`emitConversionEvent`), documentada en Global Constraints, sin task nueva (evita construir algo redundante).
- Merge por sessionId sin migración → Task 3 usa el `@@unique` ya existente, documentado en Global Constraints.
- Conflicto de identidad (sessionId vs email/phone) → Task 4, test "rechaza con 409".
- Reuso de WhatsApp handoff sin duplicar código → Task 1.
- Qualifier específico sin IA → Task 2.
- Visibilidad en Contact profile (las 8 secciones del spec) → Task 9. "Progreso del wizard" queda cubierto por el tag `Incompleto` que ya se ve en la card de Etiquetas existente (línea 443-454 del archivo), sin duplicar UI. "Ubicación" quedó como links a Google Maps (`houseMapUrl`/`meterMapUrl`, validados con `safeExternalUrl` antes de renderizarse como `href`) dentro de la card "Propiedad y techo" — no se embebe un mapa (no hay componente de mapa reusable en este archivo), pero la ubicación es accesible con un clic.
- **Calificación financiera visible** (agregado tras revisión con el usuario): `finalizeLead` (Task 4) ahora persiste `leadTemperature` + `qualificationData.qualificationStatus/qualificationSummary` en el mismo `create`/`update` — antes se calculaba y se descartaba. La card "Calificación" en Task 9 es la primera que se muestra (arriba de las demás, `md:col-span-2`) porque es el dato más accionable para ventas.
- Corte con ventana de verificación → Task 10.
- solar sin cambios de UI → Task 8, confirmado que las firmas no cambian.

**Gap identificado y resuelto durante la escritura del plan:** el spec pedía una migración de Prisma para el índice único de `sessionId` y un guard de idempotencia nuevo para CAPI — ambos ya existían en el código (`@@unique([workspaceId, source, sessionId])` y el catch de `P2002` en `emitConversionEvent`). Documentado en Global Constraints para que quien ejecute el plan no repita ese trabajo innecesariamente.

**Consistencia de tipos:** `SolarLeadPayload` (Task 3) se reusa sin cambios en Task 4 y Task 6. `FinalizeLeadResult` (Task 4) es lo que Task 6 desestructura (`result.ok`, `result.status`, `result.error`). `SOLAR_SOURCE` se exporta una sola vez (Task 3) y se reusa en Task 6 (rutas) — no hay una segunda definición.
