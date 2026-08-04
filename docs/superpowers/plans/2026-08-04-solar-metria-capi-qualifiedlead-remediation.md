# Solar↔Metria — Remediación CAPI/QualifiedLead + Corte a Producción — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar los gaps confirmados entre `dev3007` (spec de negocio original), el spec `2026-08-02-solar-metria-integration-full-spec.md` y lo implementado en `feat/solar-metria-integration`, con foco en Meta CAPI/QualifiedLead, y ejecutar el corte a producción que saca Google Sheets de la ecuación para Solar.

**Architecture:** `QualifiedLead` deja de dispararse automáticamente desde `finalizeLead` (que violaba la decisión de negocio documentada en `ESPECIFICACION_CONSOLIDADA_TRACKING_METRIA_SOLAR.md` v1.1 y `RESPUESTA_DESARROLLADOR_APROBADO_CON_CORRECCIONES.md §QualifiedLead`: "`HOT` o `CALIFICA` por sí solos no bastan"). En su lugar, `solarQualifier.ts` calcula 4 criterios automáticos del gate `solar_res_v2` (`service_area_match`, `owner_or_decision_maker`, `technical_fit_preliminary`, `bill_band_eligible` — `INSTRUCCIONES_DESARROLLADOR_TRACKING_METRIA_SOLAR_AGOSTO_2026.md §9`) y los persiste en `Contact.qualificationData`; un humano autorizado los revisa en el Contact profile y confirma explícitamente (`POST /api/crm/contacts/:id/confirm-qualified-lead`), lo que además cumple `next_step_confirmed` y la alternativa "validación humana autorizada" que el mismo documento permite. En paralelo se cierran 4 gaps preexistentes de CAPI (`event_source_url` ausente, `action_source` incorrecto, Contact/Lead sin exigir phone/email, gate de consentimiento incompleto) y se ejecuta el corte operativo que apaga el `SheetIntegration` de DrillChile.

**Tech Stack:** Express + Prisma (Backend), Next.js 16 + React 19 (Frontend), Vitest para tests.

## Global Constraints

- Single-tenant: todo hardcodeado al workspace de DrillChile vía env vars — no construir UI de configuración multi-tenant.
- El proyecto no usa `zod` — validación manual con `if (!x) { res.status(400)...; return }`, igual que el resto del módulo `leads`/`crm`.
- Test runner: Vitest (`cd Backend && npm test -- <archivo>`). Mocks de Prisma vía `vi.mock('../../../lib/prisma', ...)`, mismo patrón que `leadIngestion.service.test.ts` y `contact.service.test.ts`.
- Metodología: TDD estricto por tarea — test que falla → implementación mínima → test en verde → commit. No saltarse el paso de confirmar que el test falla antes de implementar.
- No enviar a Meta CAPI: RUT, boleta exacta, ingresos, deudas, dirección, coordenadas ni explicación del score (`INSTRUCCIONES_DESARROLLADOR_TRACKING_METRIA_SOLAR_AGOSTO_2026.md §11`) — `ALLOWED_CUSTOM_DATA_KEYS` en `metaEvents.capi.ts:25-28` ya es la única puerta de salida de `custom_data`; cualquier campo nuevo debe pasar por ese allowlist, nunca spreadearse directo.
- `emitConversionEvent` (`metaEvents.capi.ts:73-143`) ya es idempotente por `@@unique([pixelId, eventName, eventId])` — ningún task de este plan necesita un guard de idempotencia nuevo.
- `SOLAR_SOURCE = 'solar_direct'` ya está exportado desde `Backend/src/modules/leads/leadIngestion.service.ts:8` — reusar, no redefinir.

---

## Task 1: `metaEvents.capi.ts` — incluir `event_source_url` en el payload CAPI

**Files:**
- Modify: `Backend/src/modules/meta-events/metaEvents.capi.ts`
- Test: `Backend/src/modules/meta-events/__tests__/metaEvents.capi.test.ts` (archivo nuevo — no existe test previo para este módulo)

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `EmitParams` gana el campo opcional `eventSourceUrl?: string | null`. Usado por Task 3 (`metaEvents.service.ts`) para threadear el parámetro desde los emisores de dominio.

- [ ] **Step 1: Escribir el test que falla**

```typescript
// Backend/src/modules/meta-events/__tests__/metaEvents.capi.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../../lib/prisma', () => ({
  prisma: {
    contact: { findUnique: vi.fn() },
    integration: { findUnique: vi.fn() },
    conversionEvent: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn() }
  }
}))

import { emitConversionEvent } from '../metaEvents.capi'
import { prisma } from '../../../lib/prisma'

const originalFetch = global.fetch

function mockHappyPath() {
  vi.mocked(prisma.contact.findUnique).mockResolvedValue({
    consentStatus: 'granted', consentVersion: 'v1', consentAt: new Date()
  } as any)
  vi.mocked(prisma.integration.findUnique).mockResolvedValue({
    config: { pixelId: 'pix-1', accessToken: 'tok-1' }
  } as any)
  vi.mocked(prisma.conversionEvent.create).mockResolvedValue({ id: 'ce-1' } as any)
  vi.mocked(prisma.conversionEvent.update).mockResolvedValue({} as any)
  global.fetch = vi.fn().mockResolvedValue({
    ok: true, status: 200, json: async () => ({ fbtrace_id: 'fb-1', events_received: 1 })
  }) as any
}

beforeEach(() => {
  vi.clearAllMocks()
  mockHappyPath()
})
afterEach(() => { global.fetch = originalFetch })

describe('emitConversionEvent — event_source_url', () => {
  it('incluye event_source_url en el payload enviado a Meta cuando se provee', async () => {
    await emitConversionEvent({
      workspaceId: 'ws-1', leadId: 'c-1', eventName: 'Contact', actionSource: 'website',
      occurredAt: new Date(), contact: { email: 'a@b.cl' },
      eventSourceUrl: 'https://solar.drillchile.cl/paso-3'
    })

    const call = vi.mocked(global.fetch).mock.calls[0]
    const body = JSON.parse(call[1]!.body as string)
    expect(body.data[0].event_source_url).toBe('https://solar.drillchile.cl/paso-3')
  })

  it('omite event_source_url cuando no se provee', async () => {
    await emitConversionEvent({
      workspaceId: 'ws-1', leadId: 'c-1', eventName: 'Contact', actionSource: 'website',
      occurredAt: new Date(), contact: { email: 'a@b.cl' }
    })

    const call = vi.mocked(global.fetch).mock.calls[0]
    const body = JSON.parse(call[1]!.body as string)
    expect(body.data[0].event_source_url).toBeUndefined()
  })
})
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `cd Backend && npm test -- metaEvents.capi.test.ts`
Expected: FAIL — `event_source_url` es `undefined` en ambos casos (el primer test espera la URL y no está).

- [ ] **Step 3: Implementación mínima**

En `Backend/src/modules/meta-events/metaEvents.capi.ts`, modificar la interfaz `EmitParams` (línea 43-64) agregando el campo tras `eventIdSubject`:

```typescript
interface EmitParams {
  workspaceId: string
  leadId: string
  eventName: MetaEventName
  actionSource: ActionSource
  occurredAt: Date
  eventIdSuffix?: string
  eventIdSubject?: string
  // URL de origen del hito (sin PII) — INSTRUCCIONES_DESARROLLADOR_TRACKING_METRIA_SOLAR_AGOSTO_2026.md
  // §12 lo exige para Contact/Lead/FinanceApplicationSubmitted, que ocurren
  // en solar.drillchile.cl. Opcional porque eventos backend-originados
  // (Schedule, TechnicalReviewCompleted, Purchase, QualifiedLead) no tienen
  // una URL de página que los origine.
  eventSourceUrl?: string | null
  contact: {
    email?: string | null
    phone?: string | null
    fbc?: string | null
    fbp?: string | null
    clientIpAddress?: string | null
    clientUserAgent?: string | null
  }
  customData?: Record<string, string | number | boolean>
}
```

Modificar `emitConversionEvent` (línea 73-74) para destructurar el nuevo campo:

```typescript
export async function emitConversionEvent(params: EmitParams): Promise<void> {
  const { workspaceId, leadId, eventName, actionSource, occurredAt, contact, eventSourceUrl } = params
```

Y en la construcción del `payload` (línea 106-115), agregar el campo condicional:

```typescript
  const payload = {
    data: [{
      event_name: eventName,
      event_time: Math.floor(occurredAt.getTime() / 1000),
      event_id: eventId,
      action_source: actionSource,
      ...(eventSourceUrl && { event_source_url: eventSourceUrl }),
      user_data: userData,
      custom_data: customData
    }]
  }
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `cd Backend && npm test -- metaEvents.capi.test.ts`
Expected: PASS (2/2)

- [ ] **Step 5: Commit**

```bash
git add Backend/src/modules/meta-events/metaEvents.capi.ts Backend/src/modules/meta-events/__tests__/metaEvents.capi.test.ts
git commit -m "feat(meta-events): include event_source_url in CAPI payload"
```

---

## Task 2: `metaEvents.capi.ts` — exigir `consentVersion`/`consentAt` además de `consentStatus`

**Files:**
- Modify: `Backend/src/modules/meta-events/metaEvents.capi.ts`
- Test: `Backend/src/modules/meta-events/__tests__/metaEvents.capi.test.ts` (extiende el archivo de Task 1)

**Interfaces:**
- Consumes: mismo archivo de Task 1, mismos mocks de prisma.
- Produces: sin cambio de firma pública — cambia solo el comportamiento interno de `emitConversionEvent`.

- [ ] **Step 1: Escribir el test que falla**

Agregar al mismo `describe` block o uno nuevo en `metaEvents.capi.test.ts`:

```typescript
describe('emitConversionEvent — gate de consentimiento completo', () => {
  it('NO envía a Meta si consentVersion falta aunque consentStatus esté granted', async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue({
      consentStatus: 'granted', consentVersion: null, consentAt: new Date()
    } as any)

    await emitConversionEvent({
      workspaceId: 'ws-1', leadId: 'c-1', eventName: 'Contact', actionSource: 'website',
      occurredAt: new Date(), contact: { email: 'a@b.cl' }
    })

    expect(global.fetch).not.toHaveBeenCalled()
    expect(prisma.conversionEvent.create).not.toHaveBeenCalled()
  })

  it('NO envía a Meta si consentAt falta aunque consentStatus y consentVersion estén presentes', async () => {
    vi.mocked(prisma.contact.findUnique).mockResolvedValue({
      consentStatus: 'granted', consentVersion: 'v1', consentAt: null
    } as any)

    await emitConversionEvent({
      workspaceId: 'ws-1', leadId: 'c-1', eventName: 'Contact', actionSource: 'website',
      occurredAt: new Date(), contact: { email: 'a@b.cl' }
    })

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('envía a Meta cuando consentStatus, consentVersion y consentAt están todos presentes', async () => {
    await emitConversionEvent({
      workspaceId: 'ws-1', leadId: 'c-1', eventName: 'Contact', actionSource: 'website',
      occurredAt: new Date(), contact: { email: 'a@b.cl' }
    })

    expect(global.fetch).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `cd Backend && npm test -- metaEvents.capi.test.ts`
Expected: FAIL en los primeros dos tests — hoy `emitConversionEvent` solo mira `consentStatus`, así que `fetch` sí se llama aunque `consentVersion`/`consentAt` sean `null`.

- [ ] **Step 3: Implementación mínima**

En `metaEvents.capi.ts`, modificar el bloque de chequeo de consentimiento (línea 76-83):

```typescript
  const freshContact = await prisma.contact.findUnique({
    where: { id: leadId },
    select: { consentStatus: true, consentVersion: true, consentAt: true }
  })
  if (!freshContact?.consentStatus || !freshContact.consentVersion || !freshContact.consentAt) {
    console.warn(`[MetaEvents] Skipped ${eventName} for lead ${leadId}: consentStatus/consentVersion/consentAt incompletos`)
    return
  }
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `cd Backend && npm test -- metaEvents.capi.test.ts`
Expected: PASS (5/5 — los 2 de Task 1 + los 3 de este task)

- [ ] **Step 5: Commit**

```bash
git add Backend/src/modules/meta-events/metaEvents.capi.ts Backend/src/modules/meta-events/__tests__/metaEvents.capi.test.ts
git commit -m "fix(meta-events): require consentVersion and consentAt, not just consentStatus, before sending to Meta"
```

---

## Task 3: `metaEvents.service.ts` — threadear `eventSourceUrl` y `serviceAreaMatch`

**Files:**
- Modify: `Backend/src/modules/meta-events/metaEvents.service.ts`
- Test: `Backend/src/modules/meta-events/__tests__/metaEvents.service.test.ts` (archivo nuevo)

**Interfaces:**
- Consumes: `emitConversionEvent` (Task 1/2) — mockeado en el test de este task.
- Produces:
  - `emitMetaContactEvent(workspaceId, contact, actionSource, customData?, sessionId?, eventSourceUrl?): Promise<void>`
  - `emitMetaLeadEvent(workspaceId, contact, actionSource, customData?, sessionId?, eventSourceUrl?): Promise<void>`
  - `emitMetaFinanceApplicationSubmittedEvent(workspaceId, contact, actionSource, sessionId?, eventSourceUrl?): Promise<void>`
  - `emitMetaQualifiedLeadEvent(workspaceId, contact, actionSource, params: { qualificationVersion: string; scoreBand?: string; serviceAreaMatch?: boolean }): Promise<void>`
  - Usadas por Task 5 (`leadIngestion.service.ts`) y Task 6 (`contact.service.ts`).

- [ ] **Step 1: Escribir el test que falla**

```typescript
// Backend/src/modules/meta-events/__tests__/metaEvents.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../metaEvents.capi', () => ({
  emitConversionEvent: vi.fn(async () => {})
}))

import { emitMetaContactEvent, emitMetaLeadEvent, emitMetaFinanceApplicationSubmittedEvent, emitMetaQualifiedLeadEvent } from '../metaEvents.service'
import { emitConversionEvent } from '../metaEvents.capi'

const contact = { id: 'c-1', email: 'a@b.cl', phone: null }

beforeEach(() => vi.clearAllMocks())

describe('emitMetaContactEvent / emitMetaLeadEvent — eventSourceUrl', () => {
  it('pasa eventSourceUrl a emitConversionEvent cuando se provee', async () => {
    await emitMetaContactEvent('ws-1', contact, 'website', undefined, 'sess-1', 'https://solar.drillchile.cl/paso-3')
    expect(emitConversionEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventSourceUrl: 'https://solar.drillchile.cl/paso-3'
    }))
  })

  it('pasa eventSourceUrl undefined cuando no se provee', async () => {
    await emitMetaLeadEvent('ws-1', contact, 'website', undefined, 'sess-1')
    expect(emitConversionEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventSourceUrl: undefined
    }))
  })
})

describe('emitMetaFinanceApplicationSubmittedEvent — eventSourceUrl', () => {
  it('pasa eventSourceUrl a emitConversionEvent', async () => {
    await emitMetaFinanceApplicationSubmittedEvent('ws-1', contact, 'website', 'sess-1', 'https://solar.drillchile.cl/financiamiento')
    expect(emitConversionEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventSourceUrl: 'https://solar.drillchile.cl/financiamiento'
    }))
  })
})

describe('emitMetaQualifiedLeadEvent — serviceAreaMatch', () => {
  it('incluye service_area_match en custom_data cuando se provee', async () => {
    await emitMetaQualifiedLeadEvent('ws-1', contact, 'system_generated', {
      qualificationVersion: 'solar_res_v2', serviceAreaMatch: true
    })
    expect(emitConversionEvent).toHaveBeenCalledWith(expect.objectContaining({
      customData: expect.objectContaining({ qualification_version: 'solar_res_v2', service_area_match: true })
    }))
  })

  it('omite service_area_match cuando no se provee', async () => {
    await emitMetaQualifiedLeadEvent('ws-1', contact, 'system_generated', { qualificationVersion: 'solar_res_v2' })
    const call = vi.mocked(emitConversionEvent).mock.calls[0][0]
    expect(call.customData).not.toHaveProperty('service_area_match')
  })
})
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `cd Backend && npm test -- metaEvents.service.test.ts`
Expected: FAIL — ninguna de las 4 funciones acepta hoy `eventSourceUrl`/`serviceAreaMatch`.

- [ ] **Step 3: Implementación mínima**

En `Backend/src/modules/meta-events/metaEvents.service.ts`, reemplazar `emitMetaContactEvent`, `emitMetaLeadEvent`, `emitMetaFinanceApplicationSubmittedEvent` y `emitMetaQualifiedLeadEvent` (líneas 39-91):

```typescript
export async function emitMetaContactEvent(
  workspaceId: string,
  contact: ContactLike,
  actionSource: ActionSource,
  customData?: Record<string, string | number | boolean>,
  sessionId?: string,
  eventSourceUrl?: string | null
): Promise<void> {
  await emitConversionEvent({
    workspaceId, leadId: contact.id, eventName: 'Contact', actionSource,
    occurredAt: new Date(), contact: toContactData(contact), customData,
    eventIdSubject: sessionId, eventSourceUrl
  })
}

export async function emitMetaLeadEvent(
  workspaceId: string,
  contact: ContactLike,
  actionSource: ActionSource,
  customData?: Record<string, string | number | boolean>,
  sessionId?: string,
  eventSourceUrl?: string | null
): Promise<void> {
  await emitConversionEvent({
    workspaceId, leadId: contact.id, eventName: 'Lead', actionSource,
    occurredAt: new Date(), contact: toContactData(contact), customData,
    eventIdSubject: sessionId, eventSourceUrl
  })
}

export async function emitMetaFinanceApplicationSubmittedEvent(
  workspaceId: string,
  contact: ContactLike,
  actionSource: ActionSource,
  sessionId?: string,
  eventSourceUrl?: string | null
): Promise<void> {
  await emitConversionEvent({
    workspaceId, leadId: contact.id, eventName: 'FinanceApplicationSubmitted', actionSource,
    occurredAt: new Date(), contact: toContactData(contact),
    eventIdSubject: sessionId, eventSourceUrl
  })
}

export async function emitMetaQualifiedLeadEvent(
  workspaceId: string,
  contact: ContactLike,
  actionSource: ActionSource,
  params: { qualificationVersion: string; scoreBand?: string; serviceAreaMatch?: boolean }
): Promise<void> {
  await emitConversionEvent({
    workspaceId, leadId: contact.id, eventName: 'QualifiedLead', actionSource,
    occurredAt: new Date(), contact: toContactData(contact),
    customData: {
      qualification_version: params.qualificationVersion,
      ...(params.scoreBand && { score_band: params.scoreBand }),
      ...(params.serviceAreaMatch !== undefined && { service_area_match: params.serviceAreaMatch })
    }
  })
}
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `cd Backend && npm test -- metaEvents.service.test.ts`
Expected: PASS (5/5)

- [ ] **Step 5: Commit**

```bash
git add Backend/src/modules/meta-events/metaEvents.service.ts Backend/src/modules/meta-events/__tests__/metaEvents.service.test.ts
git commit -m "feat(meta-events): thread eventSourceUrl and serviceAreaMatch through domain emitters"
```

---

## Task 4: `solarQualifier.ts` — criterios automáticos del gate `solar_res_v2`

**Files:**
- Modify: `Backend/src/modules/leads/solarQualifier.ts`
- Modify: `Backend/.env.example` (documentar `SOLAR_SERVICE_AREA_COMUNAS`)
- Test: `Backend/src/modules/leads/__tests__/solarQualifier.test.ts` (extiende el archivo existente)

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `export interface SolarResV2Criteria { serviceAreaMatch: boolean; ownerOrDecisionMaker: boolean; technicalFitPreliminary: boolean; billBandEligible: boolean }`; `evaluateSolarResV2Criteria(data: Record<string, unknown>): SolarResV2Criteria` — usado por Task 5 (`leadIngestion.service.ts`) y leído por Task 6 (`contact.service.ts::confirmQualifiedLead`) desde `qualificationData.solarResV2Criteria`.

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `Backend/src/modules/leads/__tests__/solarQualifier.test.ts`:

```typescript
import { qualifySolarLead, evaluateSolarResV2Criteria } from '../solarQualifier'

describe('evaluateSolarResV2Criteria', () => {
  const ORIGINAL_ENV = process.env.SOLAR_SERVICE_AREA_COMUNAS

  beforeEach(() => { process.env.SOLAR_SERVICE_AREA_COMUNAS = 'Providencia,Las Condes' })
  afterEach(() => { process.env.SOLAR_SERVICE_AREA_COMUNAS = ORIGINAL_ENV })

  it('los 4 criterios son true cuando el lead cumple todo', () => {
    const result = evaluateSolarResV2Criteria({
      comuna: 'Providencia', ownershipType: 'dueño', techoConfirmado: true, montoBoleta: '45000'
    })
    expect(result).toEqual({
      serviceAreaMatch: true, ownerOrDecisionMaker: true, technicalFitPreliminary: true, billBandEligible: true
    })
  })

  it('serviceAreaMatch es false cuando la comuna no está en el allowlist', () => {
    const result = evaluateSolarResV2Criteria({ comuna: 'Puente Alto', ownershipType: 'dueño', techoConfirmado: true, montoBoleta: '45000' })
    expect(result.serviceAreaMatch).toBe(false)
  })

  it('serviceAreaMatch es false cuando SOLAR_SERVICE_AREA_COMUNAS no está configurado (fail-safe)', () => {
    process.env.SOLAR_SERVICE_AREA_COMUNAS = ''
    const result = evaluateSolarResV2Criteria({ comuna: 'Providencia', ownershipType: 'dueño', techoConfirmado: true, montoBoleta: '45000' })
    expect(result.serviceAreaMatch).toBe(false)
  })

  it('ownerOrDecisionMaker es false para arrendatario', () => {
    const result = evaluateSolarResV2Criteria({ comuna: 'Providencia', ownershipType: 'arrendatario', techoConfirmado: true, montoBoleta: '45000' })
    expect(result.ownerOrDecisionMaker).toBe(false)
  })

  it('technicalFitPreliminary es false cuando techoConfirmado no es exactamente true', () => {
    const result = evaluateSolarResV2Criteria({ comuna: 'Providencia', ownershipType: 'dueño', montoBoleta: '45000' })
    expect(result.technicalFitPreliminary).toBe(false)
  })

  it('billBandEligible es false bajo el umbral mínimo', () => {
    const result = evaluateSolarResV2Criteria({ comuna: 'Providencia', ownershipType: 'dueño', techoConfirmado: true, montoBoleta: '15000' })
    expect(result.billBandEligible).toBe(false)
  })
})
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `cd Backend && npm test -- solarQualifier.test.ts`
Expected: FAIL con "evaluateSolarResV2Criteria is not exported" o similar.

- [ ] **Step 3: Implementación mínima**

Agregar al final de `Backend/src/modules/leads/solarQualifier.ts` (reusa `parseMontoBoleta` y `MIN_MONTHLY_BILL_CLP` ya definidos arriba en el mismo archivo):

```typescript
export interface SolarResV2Criteria {
  serviceAreaMatch: boolean
  ownerOrDecisionMaker: boolean
  technicalFitPreliminary: boolean
  billBandEligible: boolean
}

/**
 * Allowlist leída en cada llamada (no cacheada a nivel de módulo) para que
 * cambios de env var surtan efecto sin reiniciar el proceso y para que los
 * tests puedan controlarla con process.env directamente. Vacía por diseño =
 * fail-safe: sin comunas configuradas, ningún lead pasa service_area_match
 * automáticamente — evita "calificar" por defecto por un env var olvidado.
 */
function isInServiceArea(comuna: string): boolean {
  const allowlist = (process.env.SOLAR_SERVICE_AREA_COMUNAS ?? '')
    .split(',').map(c => c.trim().toLowerCase()).filter(Boolean)
  if (allowlist.length === 0) return false
  return allowlist.includes(comuna.trim().toLowerCase())
}

/**
 * Los 4 criterios automáticos del gate `solar_res_v2`
 * (INSTRUCCIONES_DESARROLLADOR_TRACKING_METRIA_SOLAR_AGOSTO_2026.md §9) que
 * SÍ se pueden derivar de StepData sin intervención humana. Los otros dos
 * campos que ese documento exige — `next_step_confirmed` y la validación
 * humana en sí — no se calculan aquí: los satisface el flujo de
 * confirmación manual (contact.service.ts::confirmQualifiedLead, Task 6).
 */
export function evaluateSolarResV2Criteria(data: Record<string, unknown>): SolarResV2Criteria {
  const comuna = String(data.comuna ?? '')
  const ownershipType = String(data.ownershipType ?? '')
  const montoBoleta = parseMontoBoleta(data.montoBoleta)

  return {
    serviceAreaMatch: isInServiceArea(comuna),
    ownerOrDecisionMaker: ownershipType === 'dueño' || ownershipType === 'familiar',
    technicalFitPreliminary: data.techoConfirmado === true,
    billBandEligible: montoBoleta !== null && montoBoleta >= MIN_MONTHLY_BILL_CLP
  }
}
```

En `Backend/.env.example`, agregar tras la línea `SOLAR_STAGE_ID="..."` (línea 79):

```bash
# SOLAR_SERVICE_AREA_COMUNAS: comunas atendidas por DrillChile, separadas por
# coma, sin distinguir mayúsculas/minúsculas. Usada por
# solarQualifier.evaluateSolarResV2Criteria para el criterio
# service_area_match del gate QualifiedLead (solar_res_v2,
# INSTRUCCIONES_DESARROLLADOR_TRACKING_METRIA_SOLAR_AGOSTO_2026.md §9).
# CONFIRMAR LA LISTA REAL CON DRILLCHILE ANTES DE DESPLEGAR A PRODUCCIÓN —
# el valor de ejemplo abajo NO es autoritativo.
SOLAR_SERVICE_AREA_COMUNAS="Providencia,Las Condes,Vitacura,Ñuñoa,La Reina"
```

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `cd Backend && npm test -- solarQualifier.test.ts`
Expected: PASS (13/13 — 7 tests existentes + 6 nuevos)

- [ ] **Step 5: Commit**

```bash
git add Backend/src/modules/leads/solarQualifier.ts Backend/src/modules/leads/__tests__/solarQualifier.test.ts Backend/.env.example
git commit -m "feat(leads): add solar_res_v2 automated qualification criteria"
```

---

## Task 5: `leadIngestion.service.ts` — quitar auto-disparo de QualifiedLead, fijar `action_source`, exigir phone/email, persistir criterios

**Files:**
- Modify: `Backend/src/modules/leads/leadIngestion.service.ts`
- Modify: `Backend/src/modules/leads/__tests__/leadIngestion.service.test.ts`

**Interfaces:**
- Consumes: `evaluateSolarResV2Criteria` (Task 4), firmas nuevas de `emitMetaContactEvent`/`emitMetaLeadEvent`/`emitMetaFinanceApplicationSubmittedEvent` (Task 3).
- Produces: `FinalizeLeadResult` sin cambios de forma; `qualificationData` gana el campo `solarResV2Criteria` — consumido por Task 6 (`confirmQualifiedLead`) y por Task 7 (UI del Contact profile).

- [ ] **Step 1: Actualizar los mocks y escribir los tests que fallan**

En `Backend/src/modules/leads/__tests__/leadIngestion.service.test.ts`, reemplazar el mock de `../solarQualifier` (línea 11-13) para incluir la nueva función:

```typescript
vi.mock('../solarQualifier', () => ({
  qualifySolarLead: vi.fn(() => ({ qualificationStatus: 'CALIFICA', qualificationSummary: 'ok' })),
  evaluateSolarResV2Criteria: vi.fn(() => ({
    serviceAreaMatch: true, ownerOrDecisionMaker: true, technicalFitPreliminary: true, billBandEligible: true
  }))
}))
```

Y agregar el import correspondiente junto al de `qualifySolarLead` (línea 25):

```typescript
import { qualifySolarLead, evaluateSolarResV2Criteria } from '../solarQualifier'
```

Reemplazar el test `'finaliza un lead nuevo: quita tag Incompleto, califica, crea Deal, dispara CAPI y handoff WhatsApp'` (línea 160-201) — la única diferencia es que ya NO debe disparar `QualifiedLead` automáticamente, debe usar `action_source='website'`, y debe persistir `solarResV2Criteria`:

```typescript
  it('finaliza un lead nuevo: quita tag Incompleto, califica, crea Deal, dispara CAPI (website) y handoff WhatsApp — sin disparar QualifiedLead automáticamente', async () => {
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
      nombre: 'Roberto Pérez', telefono: '+56 9 1234 5678', montoBoleta: '45000',
      landingUrl: 'https://solar.drillchile.cl/gracias'
    } as any)

    expect(result.ok).toBe(true)
    expect(prisma.contactTag.deleteMany).toHaveBeenCalledWith({ where: { contactId: 'c1', name: 'Incompleto' } })
    expect(qualifySolarLead).toHaveBeenCalled()
    expect(evaluateSolarResV2Criteria).toHaveBeenCalled()
    expect(prisma.contact.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'c1' },
      data: expect.objectContaining({
        leadTemperature: 'HOT',
        qualificationData: expect.objectContaining({
          qualificationStatus: 'CALIFICA',
          qualificationSummary: 'ok',
          solarResV2Criteria: {
            serviceAreaMatch: true, ownerOrDecisionMaker: true, technicalFitPreliminary: true, billBandEligible: true
          }
        })
      })
    }))
    expect(prisma.deal.create).toHaveBeenCalled()
    expect(emitMetaContactEvent).toHaveBeenCalledWith(
      WS_ID, expect.objectContaining({ id: 'c1' }), 'website', undefined, 'sess-1', 'https://solar.drillchile.cl/gracias'
    )
    expect(emitMetaLeadEvent).toHaveBeenCalledWith(
      WS_ID, expect.objectContaining({ id: 'c1' }), 'website', undefined, 'sess-1', 'https://solar.drillchile.cl/gracias'
    )
    expect(emitMetaQualifiedLeadEvent).not.toHaveBeenCalled()
    expect(emitMetaFinanceApplicationSubmittedEvent).not.toHaveBeenCalled()
    expect(prepareWhatsappConversation).not.toHaveBeenCalled() // sin canal conectado
  })
```

Reemplazar el test `'NO dispara QualifiedLead cuando la calificación es REVISAR o NO_CALIFICA'` (línea 243-256) — ahora la razón por la que nunca se dispara automático ya no depende del `qualificationStatus`, así que el test se simplifica a confirmar que el emisor de QualifiedLead nunca se llama desde `finalizeLead` bajo ningún resultado de calificación:

```typescript
  it('NUNCA dispara QualifiedLead automáticamente desde finalizeLead, sin importar el resultado de calificación', async () => {
    vi.mocked(prisma.contact.findUnique)
      .mockResolvedValueOnce({ id: 'c2', name: 'x', email: null, phone: null, qualificationData: { rawFields: {} } } as any)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
    vi.mocked(prisma.contact.update).mockResolvedValue({ id: 'c2', name: 'x', phone: null, email: null } as any)
    vi.mocked(prisma.deal.findFirst).mockResolvedValue({ id: 'd1' } as any)
    vi.mocked(prisma.channel.findFirst).mockResolvedValue(null)

    await finalizeLead(WS_ID, { sessionId: 'sess-3', consentAccepted: true } as any)

    expect(emitMetaQualifiedLeadEvent).not.toHaveBeenCalled()
  })
```

Agregar un test nuevo para el gate de phone/email (aprobación dev3007 §2.G):

```typescript
  it('NO dispara Contact/Lead/FinanceApplicationSubmitted a Meta si el contacto no tiene email ni phone válidos', async () => {
    vi.mocked(prisma.contact.findUnique)
      .mockResolvedValueOnce({ id: 'c3', name: 'x', email: null, phone: null, qualificationData: { rawFields: {} } } as any)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
    vi.mocked(prisma.contact.update).mockResolvedValue({ id: 'c3', name: 'x', phone: null, email: null } as any)
    vi.mocked(prisma.deal.findFirst).mockResolvedValue({ id: 'd1' } as any)
    vi.mocked(prisma.channel.findFirst).mockResolvedValue(null)

    await finalizeLead(WS_ID, { sessionId: 'sess-4', consentAccepted: true } as any)

    expect(emitMetaContactEvent).not.toHaveBeenCalled()
    expect(emitMetaLeadEvent).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Correr los tests y confirmar que fallan**

Run: `cd Backend && npm test -- leadIngestion.service.test.ts`
Expected: FAIL — `evaluateSolarResV2Criteria` no existe todavía en el mock consumido por el código real, `action_source` sigue siendo `'system_generated'`, `emitMetaQualifiedLeadEvent` sigue disparándose, y no hay gate de phone/email.

- [ ] **Step 3: Implementación**

En `Backend/src/modules/leads/leadIngestion.service.ts`:

Modificar el import de `solarQualifier` (línea 4):

```typescript
import { qualifySolarLead, evaluateSolarResV2Criteria } from './solarQualifier'
```

Modificar el import de `metaEvents.service` (línea 6) — ya no se importa `emitMetaQualifiedLeadEvent` en este archivo porque `finalizeLead` deja de emitirlo:

```typescript
import { emitMetaContactEvent, emitMetaLeadEvent, emitMetaFinanceApplicationSubmittedEvent } from '../meta-events/metaEvents.service'
```

Reemplazar el bloque de cálculo de calificación dentro de `finalizeLead` (línea 191-202):

```typescript
  // Computed BEFORE writing the Contact so qualificationStatus/leadTemperature
  // land in the same create/update call — the Contact profile (Task 9) reads
  // qualificationData.qualificationStatus + qualificationSummary directly,
  // never re-derives them, so they must be persisted, not just computed.
  const qualResult = qualifySolarLead(mergedRawFields)
  const solarResV2Criteria = evaluateSolarResV2Criteria(mergedRawFields)
  const leadTemperature = qualResult.qualificationStatus === 'CALIFICA' ? 'HOT'
    : qualResult.qualificationStatus === 'REVISAR' ? 'WARM' : 'COLD'
  const qualificationData = {
    rawFields: mergedRawFields,
    qualificationStatus: qualResult.qualificationStatus,
    qualificationSummary: qualResult.qualificationSummary,
    solarResV2Criteria
  }
```

Reemplazar el bloque de disparo de eventos CAPI (línea 264-277) — cambia `action_source` a `'website'`, agrega el gate de phone/email, threadea `eventSourceUrl`, y elimina el auto-disparo de `QualifiedLead`:

```typescript
  // Contact/Lead/FinanceApplicationSubmitted se originan directamente en el
  // wizard de solar.drillchile.cl — action_source='website'
  // (INSTRUCCIONES_DESARROLLADOR_TRACKING_METRIA_SOLAR_AGOSTO_2026.md §12),
  // no 'system_generated'. Solo se disparan si hay identidad verificable
  // (aprobación dev3007 §2.G: "Contact solo si teléfono/email válido") —
  // enviar user_data casi vacío a Meta no cumple esa exigencia.
  const hasValidIdentity = !!(contact.email || contact.phone)
  if (hasValidIdentity) {
    emitMetaContactEvent(workspaceId, contact, 'website', undefined, payload.sessionId, payload.landingUrl)
      .catch(err => console.error('[LeadIngestion] Contact event failed:', err))
    emitMetaLeadEvent(workspaceId, contact, 'website', undefined, payload.sessionId, payload.landingUrl)
      .catch(err => console.error('[LeadIngestion] Lead event failed:', err))

    if (isFinancingApplication(payload)) {
      emitMetaFinanceApplicationSubmittedEvent(workspaceId, contact, 'website', payload.sessionId, payload.landingUrl)
        .catch(err => console.error('[LeadIngestion] FinanceApplicationSubmitted event failed:', err))
    }
  } else {
    console.warn(`[LeadIngestion] Skipping Meta CAPI for contact ${contact.id}: no valid email/phone`)
  }

  // QualifiedLead a Meta CAPI: NO se dispara automáticamente aquí. dev3007
  // (ESPECIFICACION_CONSOLIDADA_TRACKING_METRIA_SOLAR.md v1.1 §3,
  // RESPUESTA_DESARROLLADOR_APROBADO_CON_CORRECCIONES.md §QualifiedLead)
  // exige la regla completa solar_res_v2 (los 4 criterios de
  // qualificationData.solarResV2Criteria) MÁS validación humana autorizada
  // antes de emitir — qualResult.qualificationStatus==='CALIFICA' por sí
  // solo no basta, mismo criterio ya aplicado en
  // contact.service.ts:227-229 y sheets.service.ts. La emisión real ocurre
  // en contact.service.ts::confirmQualifiedLead (Task 6) cuando un humano
  // confirma desde el Contact profile.
```

- [ ] **Step 4: Correr los tests y confirmar que pasan**

Run: `cd Backend && npm test -- leadIngestion.service.test.ts`
Expected: PASS (todos los tests del archivo, incluidos los 2 modificados y el 1 nuevo)

- [ ] **Step 5: Commit**

```bash
git add Backend/src/modules/leads/leadIngestion.service.ts Backend/src/modules/leads/__tests__/leadIngestion.service.test.ts
git commit -m "fix(leads): stop auto-firing QualifiedLead, use action_source=website, require phone/email before CAPI"
```

---

## Task 6: `contact.service.ts` — `confirmQualifiedLead` (validación humana autorizada)

**Files:**
- Modify: `Backend/src/modules/crm/contact.service.ts`
- Test: `Backend/src/modules/crm/__tests__/contact.service.test.ts`

**Interfaces:**
- Consumes: `SOLAR_SOURCE` de `../leads/leadIngestion.service` (Task 5 no cambia su export); `emitMetaQualifiedLeadEvent` de `../meta-events/metaEvents.service` (Task 3).
- Produces: `confirmQualifiedLead(workspaceId: string, contactId: string, actorUserId: string, options?: { override?: boolean; overrideReason?: string }): Promise<Contact>` — usado por Task 7 (`crm.controller.ts`).

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `Backend/src/modules/crm/__tests__/contact.service.test.ts`, extendiendo el mock de prisma existente (línea 3-19) con `contact.findFirst`/`update` ya presentes, y agregando el mock del emisor CAPI:

```typescript
// Agregar junto a los demás vi.mock() al inicio del archivo:
vi.mock('../../meta-events/metaEvents.service', () => ({
  emitMetaQualifiedLeadEvent: vi.fn(async () => {})
}))
```

Agregar el import correspondiente junto a los demás (línea 21):

```typescript
import { listContacts, getContact, updateContact, addNote, addTag, removeTag, calculateHealthScore, updateQualification, findPossibleDuplicates, mergeContacts, confirmQualifiedLead } from '../contact.service'
import { emitMetaQualifiedLeadEvent } from '../../meta-events/metaEvents.service'
```

Agregar al final del archivo:

```typescript
describe('confirmQualifiedLead', () => {
  const ALL_MET = { serviceAreaMatch: true, ownerOrDecisionMaker: true, technicalFitPreliminary: true, billBandEligible: true }

  it('rechaza si el contacto no existe', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue(null)
    await expect(confirmQualifiedLead(WS, CONTACT_ID, 'user-1')).rejects.toThrow('not found')
  })

  it('rechaza si el contacto no es source solar_direct', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({
      id: CONTACT_ID, source: 'sheet_import', qualificationData: { solarResV2Criteria: ALL_MET }
    } as any)
    await expect(confirmQualifiedLead(WS, CONTACT_ID, 'user-1')).rejects.toThrow('solar_direct')
  })

  it('rechaza si no hay solarResV2Criteria calculado todavía', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({
      id: CONTACT_ID, source: 'solar_direct', qualificationData: {}
    } as any)
    await expect(confirmQualifiedLead(WS, CONTACT_ID, 'user-1')).rejects.toThrow('No solar_res_v2 criteria')
  })

  it('rechaza sin override si no todos los criterios están cumplidos', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({
      id: CONTACT_ID, source: 'solar_direct',
      qualificationData: { solarResV2Criteria: { ...ALL_MET, billBandEligible: false } }
    } as any)
    await expect(confirmQualifiedLead(WS, CONTACT_ID, 'user-1')).rejects.toThrow('not fully met')
  })

  it('rechaza override sin overrideReason', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({
      id: CONTACT_ID, source: 'solar_direct',
      qualificationData: { solarResV2Criteria: { ...ALL_MET, billBandEligible: false } }
    } as any)
    await expect(confirmQualifiedLead(WS, CONTACT_ID, 'user-1', { override: true })).rejects.toThrow('overrideReason is required')
  })

  it('rechaza si ya fue confirmado antes', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({
      id: CONTACT_ID, source: 'solar_direct',
      qualificationData: { solarResV2Criteria: ALL_MET, qualifiedLeadConfirmedAt: '2026-08-01T00:00:00.000Z' }
    } as any)
    await expect(confirmQualifiedLead(WS, CONTACT_ID, 'user-1')).rejects.toThrow('already confirmed')
  })

  it('confirma, persiste qualificationVersion/nextStepConfirmed/confirmedBy y dispara QualifiedLead a Meta cuando todos los criterios están cumplidos', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({
      id: CONTACT_ID, source: 'solar_direct', email: 'a@b.cl',
      qualificationData: { rawFields: {}, solarResV2Criteria: ALL_MET }
    } as any)
    vi.mocked(prisma.contact.update).mockResolvedValue({ id: CONTACT_ID, email: 'a@b.cl' } as any)

    await confirmQualifiedLead(WS, CONTACT_ID, 'user-1')

    expect(prisma.contact.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: CONTACT_ID },
      data: expect.objectContaining({
        qualificationData: expect.objectContaining({
          qualificationVersion: 'solar_res_v2',
          nextStepConfirmed: true,
          qualifiedLeadConfirmedBy: 'user-1'
        })
      })
    }))
    expect(emitMetaQualifiedLeadEvent).toHaveBeenCalledWith(
      WS, expect.objectContaining({ id: CONTACT_ID }), 'system_generated',
      { qualificationVersion: 'solar_res_v2', serviceAreaMatch: true }
    )
  })

  it('permite override con overrideReason y lo persiste, aunque falten criterios', async () => {
    vi.mocked(prisma.contact.findFirst).mockResolvedValue({
      id: CONTACT_ID, source: 'solar_direct',
      qualificationData: { rawFields: {}, solarResV2Criteria: { ...ALL_MET, billBandEligible: false } }
    } as any)
    vi.mocked(prisma.contact.update).mockResolvedValue({ id: CONTACT_ID } as any)

    await confirmQualifiedLead(WS, CONTACT_ID, 'user-1', { override: true, overrideReason: 'Cliente confirmó boleta real por teléfono, sistema no la capturó' })

    expect(prisma.contact.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        qualificationData: expect.objectContaining({
          qualifiedLeadOverrideReason: 'Cliente confirmó boleta real por teléfono, sistema no la capturó'
        })
      })
    }))
    expect(emitMetaQualifiedLeadEvent).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Correr los tests y confirmar que fallan**

Run: `cd Backend && npm test -- contact.service.test.ts`
Expected: FAIL con "confirmQualifiedLead is not a function" o similar.

- [ ] **Step 3: Implementación mínima**

Agregar el import al inicio de `Backend/src/modules/crm/contact.service.ts` (línea 1):

```typescript
import { prisma } from '../../lib/prisma'
import { SOLAR_SOURCE } from '../leads/leadIngestion.service'
import { emitMetaQualifiedLeadEvent } from '../meta-events/metaEvents.service'
```

Agregar al final del archivo, después de `updateQualification` (tras línea 232):

```typescript
interface SolarResV2Criteria {
  serviceAreaMatch: boolean
  ownerOrDecisionMaker: boolean
  technicalFitPreliminary: boolean
  billBandEligible: boolean
}

/**
 * "Validación humana autorizada" — la alternativa explícita que
 * INSTRUCCIONES_DESARROLLADOR_TRACKING_METRIA_SOLAR_AGOSTO_2026.md §9 ofrece
 * a la regla automática solar_res_v2 completa ("regla solar_res_v2 o
 * validación humana autorizada"). Requerir esta confirmación explícita —
 * en vez de disparar QualifiedLead solo porque los 4 criterios automáticos
 * dieron true — es además la forma más defendible de cubrir
 * next_step_confirmed sin inventar una heurística no especificada en los
 * documentos de negocio: quien confirma está, por definición, confirmando
 * que corresponde el siguiente paso.
 */
export async function confirmQualifiedLead(
  workspaceId: string,
  contactId: string,
  actorUserId: string,
  options: { override?: boolean; overrideReason?: string } = {}
) {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, workspaceId } })
  if (!contact) throw new Error('Contact not found')
  if (contact.source !== SOLAR_SOURCE) {
    throw new Error('Only solar_direct contacts support solar_res_v2 QualifiedLead confirmation')
  }

  const qualificationData = (contact.qualificationData as Record<string, any>) ?? {}
  if (qualificationData.qualifiedLeadConfirmedAt) {
    throw new Error('QualifiedLead already confirmed for this contact')
  }

  const criteria = qualificationData.solarResV2Criteria as SolarResV2Criteria | undefined
  if (!criteria) throw new Error('No solar_res_v2 criteria computed yet for this contact')

  const allCriteriaMet = criteria.serviceAreaMatch && criteria.ownerOrDecisionMaker
    && criteria.technicalFitPreliminary && criteria.billBandEligible

  if (!allCriteriaMet && !options.override) {
    throw new Error('solar_res_v2 criteria not fully met — pass override:true with overrideReason to confirm manually')
  }
  if (options.override && !options.overrideReason?.trim()) {
    throw new Error('overrideReason is required when overriding solar_res_v2 criteria')
  }

  const updatedQualificationData = {
    ...qualificationData,
    qualificationVersion: 'solar_res_v2',
    nextStepConfirmed: true,
    qualifiedLeadConfirmedBy: actorUserId,
    qualifiedLeadConfirmedAt: new Date().toISOString(),
    ...(options.override && { qualifiedLeadOverrideReason: options.overrideReason!.trim() })
  }

  const updated = await prisma.contact.update({
    where: { id: contact.id },
    data: { qualificationData: updatedQualificationData as any }
  })

  emitMetaQualifiedLeadEvent(workspaceId, updated, 'system_generated', {
    qualificationVersion: 'solar_res_v2',
    serviceAreaMatch: criteria.serviceAreaMatch
  }).catch(err => console.error('[ContactService] QualifiedLead event failed:', err))

  return updated
}
```

- [ ] **Step 4: Correr los tests y confirmar que pasan**

Run: `cd Backend && npm test -- contact.service.test.ts`
Expected: PASS (todos, incluidos los 7 nuevos de `confirmQualifiedLead`)

- [ ] **Step 5: Commit**

```bash
git add Backend/src/modules/crm/contact.service.ts Backend/src/modules/crm/__tests__/contact.service.test.ts
git commit -m "feat(crm): add confirmQualifiedLead — human-authorized solar_res_v2 gate for QualifiedLead"
```

---

## Task 7: `crm.controller.ts` + `crm.routes.ts` — endpoint `POST /crm/contacts/:contactId/confirm-qualified-lead`

**Files:**
- Modify: `Backend/src/modules/crm/crm.controller.ts`
- Modify: `Backend/src/modules/crm/crm.routes.ts`
- Test: correr la suite existente de rutas CRM si existe (`Backend/src/modules/crm/__tests__/*.routes.test.ts`) — si no hay test de integración de rutas para este módulo, este task no crea uno nuevo (sigue el patrón: los tests de comportamiento viven en `contact.service.test.ts`, Task 6; el controller es un adaptador delgado sin lógica propia que testear por separado, mismo patrón que el resto de `crm.controller.ts`).

**Interfaces:**
- Consumes: `confirmQualifiedLead` (Task 6).
- Produces: ruta autenticada `POST /api/crm/contacts/:contactId/confirm-qualified-lead` — usada por Task 8 (Frontend).

- [ ] **Step 1: Implementación** (sin test nuevo — ver nota en Files; el comportamiento ya está cubierto por Task 6)

En `Backend/src/modules/crm/crm.controller.ts`, agregar tras `updateQualification`-relacionados o al final del bloque `// ── Contacts ──` (tras `calculateHealthScoreHandler`, línea 117):

```typescript
function confirmQualifiedLeadStatus(msg: string): number {
  if (msg.toLowerCase().includes('not found')) return 404
  if (msg.includes('not fully met') || msg.includes('already confirmed') || msg.includes('Only solar_direct')) return 409
  if (msg.includes('No solar_res_v2 criteria') || msg.includes('overrideReason is required')) return 400
  return 500
}

export async function confirmQualifiedLeadHandler(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { override, overrideReason } = req.body
    const updated = await cs.confirmQualifiedLead(req.user!.workspaceId!, req.params.contactId, req.user!.id!, { override, overrideReason })
    res.json(updated)
  } catch (err: any) {
    res.status(confirmQualifiedLeadStatus(err.message)).json({ error: err.message })
  }
}
```

En `Backend/src/modules/crm/crm.routes.ts`, agregar `confirmQualifiedLeadHandler` al import de `./crm.controller` (línea 7-20):

```typescript
import {
  listContactsHandler, getContactHandler, createContactHandler, updateContactHandler,
  addNoteHandler, addTagHandler, removeTagHandler, calculateHealthScoreHandler,
  confirmQualifiedLeadHandler,
  bulkUpdateContactsHandler, bulkDeleteContactsHandler,
  listDuplicateContactsHandler, mergeContactsHandler,
  listCustomFieldsHandler, createCustomFieldHandler, deleteCustomFieldHandler, setContactCustomFieldsHandler,
  listPipelinesHandler, createPipelineHandler,
  createStageHandler, updateStageHandler, deleteStageHandler, reorderStagesHandler,
  listDealsHandler, createDealHandler, moveDealHandler, closeDealHandler, updateDealHandler,
  deleteDealHandler, getWorkspaceUsersHandler,
  pipelineAnalyticsHandler,
  listTicketsHandler, createTicketHandler, updateTicketHandler, resolveTicketHandler,
  listTasksHandler, completeTaskHandler
} from './crm.controller'
```

Y agregar la ruta tras `health-score` (línea 35):

```typescript
router.post('/crm/contacts/:contactId/health-score', ...auth, calculateHealthScoreHandler)
router.post('/crm/contacts/:contactId/confirm-qualified-lead', ...auth, confirmQualifiedLeadHandler)
```

- [ ] **Step 2: Verificar manualmente con curl contra un servidor local**

Run: `cd Backend && npm run dev` (en una terminal), luego en otra:

```bash
curl -X POST http://localhost:4000/api/crm/contacts/<contactId-real>/confirm-qualified-lead \
  -H "Authorization: Bearer <token-real>" -H "Content-Type: application/json" -d '{}'
```

Expected: `404` si el contactId no existe, `409` si los criterios no están todos cumplidos, `200` con el contacto actualizado si califica un `solar_direct` con los 4 criterios en `true`.

- [ ] **Step 3: Commit**

```bash
git add Backend/src/modules/crm/crm.controller.ts Backend/src/modules/crm/crm.routes.ts
git commit -m "feat(crm): expose POST /crm/contacts/:id/confirm-qualified-lead"
```

---

## Task 8: Frontend — card de confirmación de QualifiedLead en el Contact profile

**Files:**
- Modify: `metria-metrics/Frontend/src/app/dashboard/crm/contacts/[contactId]/ContactProfileClient.tsx`

**Interfaces:**
- Consumes: `POST /crm/contacts/:contactId/confirm-qualified-lead` (Task 7); lee `contact.qualificationData.solarResV2Criteria` (Task 5).
- Produces: componente `QualifiedLeadConfirmCard` renderizado junto a `SolarLeadCard`.

No hay test automatizado para este archivo (no existe `ContactProfileClient.test.tsx` en el repo — confirmado, ningún componente de esta página tiene test dedicado hoy). Verificación manual en navegador según Step 3.

- [ ] **Step 1: Implementación**

Agregar el nuevo componente en `ContactProfileClient.tsx`, justo después de la función `SolarLeadCard` (tras su cierre, antes de `interface Contact` en línea 251):

```tsx
interface SolarResV2Criteria {
  serviceAreaMatch: boolean
  ownerOrDecisionMaker: boolean
  technicalFitPreliminary: boolean
  billBandEligible: boolean
}

function CriterionRow({ label, met }: { label: string; met: boolean }) {
  return (
    <li className={met ? 'text-green-700' : 'text-muted-foreground'}>
      {met ? '✓' : '○'} {label}
    </li>
  )
}

/**
 * Gate de validación humana para QualifiedLead (dev3007: "regla solar_res_v2
 * o validación humana autorizada" — INSTRUCCIONES_DESARROLLADOR_TRACKING_METRIA_SOLAR_AGOSTO_2026.md
 * §9). leadIngestion.service.ts ya NO dispara QualifiedLead automáticamente;
 * esta card es el único lugar desde donde se confirma.
 */
function QualifiedLeadConfirmCard({ contact, onConfirmed }: { contact: Contact; onConfirmed: (patch: Partial<Contact>) => void }) {
  const qd = (contact.qualificationData ?? {}) as Record<string, unknown>
  const criteria = qd.solarResV2Criteria as SolarResV2Criteria | undefined
  const alreadyConfirmed = !!qd.qualifiedLeadConfirmedAt
  const [showOverride, setShowOverride] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!criteria || alreadyConfirmed) return null

  const allMet = criteria.serviceAreaMatch && criteria.ownerOrDecisionMaker
    && criteria.technicalFitPreliminary && criteria.billBandEligible

  async function confirm(override: boolean) {
    setSubmitting(true)
    try {
      const updated = await fetchAPI(`/crm/contacts/${contact.id}/confirm-qualified-lead`, {
        method: 'POST',
        body: JSON.stringify(override ? { override: true, overrideReason } : {})
      })
      onConfirmed(updated)
      toast.success('Lead calificado confirmado — evento enviado a Meta')
      setShowOverride(false)
    } catch {
      toast.error('No se pudo confirmar el lead calificado')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-lg border p-4 space-y-3 md:col-span-2">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Confirmación QualifiedLead (solar_res_v2)</h3>
      <ul className="text-sm space-y-1">
        <CriterionRow label="Zona de cobertura" met={criteria.serviceAreaMatch} />
        <CriterionRow label="Propietario/decisor" met={criteria.ownerOrDecisionMaker} />
        <CriterionRow label="Aptitud técnica preliminar (techo)" met={criteria.technicalFitPreliminary} />
        <CriterionRow label="Banda de boleta elegible" met={criteria.billBandEligible} />
      </ul>
      {allMet ? (
        <button type="button" disabled={submitting} onClick={() => confirm(false)}
          className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-50">
          Confirmar Lead Calificado
        </button>
      ) : showOverride ? (
        <div className="space-y-2">
          <textarea value={overrideReason} onChange={e => setOverrideReason(e.target.value)}
            placeholder="Motivo de la excepción (obligatorio)"
            className="w-full text-sm border rounded-md p-2" rows={2} />
          <div className="flex gap-2">
            <button type="button" disabled={submitting || !overrideReason.trim()} onClick={() => confirm(true)}
              className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-50">
              Confirmar con excepción
            </button>
            <button type="button" onClick={() => setShowOverride(false)} className="text-sm px-3 py-1.5 rounded-md border">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setShowOverride(true)} className="text-sm px-3 py-1.5 rounded-md border">
          No cumple todos los criterios — confirmar con excepción
        </button>
      )}
    </div>
  )
}
```

Modificar el punto de render en el componente padre (línea 660):

```tsx
{contact.source === 'solar_direct' && (
  <>
    <SolarLeadCard contact={contact} />
    <QualifiedLeadConfirmCard contact={contact} onConfirmed={(patch) => setContact(c => c ? { ...c, ...patch } : c)} />
  </>
)}
```

- [ ] **Step 2: Verificar tipos**

Run: `cd metria-metrics/Frontend && pnpm build` (o `pnpm tsc --noEmit` si existe ese script)
Expected: sin errores de tipo nuevos.

- [ ] **Step 3: Verificación manual en navegador**

Run: `cd metria-metrics/Frontend && pnpm dev`, abrir `/dashboard/crm/contacts/<id-de-un-contact-solar_direct-con-solarResV2Criteria>` y confirmar:
- La card "Confirmación QualifiedLead (solar_res_v2)" aparece con los 4 criterios listados.
- Si los 4 están en verde, el botón "Confirmar Lead Calificado" dispara la llamada y la card desaparece tras éxito (toast verde).
- Si falta alguno, aparece el flujo de excepción con textarea obligatorio.
- Un contacto ya confirmado (`qualifiedLeadConfirmedAt` seteado) no muestra la card.

- [ ] **Step 4: Commit**

```bash
git add "metria-metrics/Frontend/src/app/dashboard/crm/contacts/[contactId]/ContactProfileClient.tsx"
git commit -m "feat(crm-ui): add human QualifiedLead confirmation card to Contact profile"
```

---

## Task 9: Corte a producción — sacar Google Sheets de la ecuación para Solar

**Files:** ninguno de código — checklist operativo. Reusa y adapta el Task 17 ya escrito en `docs/superpowers/specs/2026-08-02-solar-metria-integration-full-spec.md:2461-2477`, con dos prerequisitos nuevos que agregan los Tasks 4 y 6-8 de este plan.

- [ ] **Step 1: Prerequisitos nuevos de este plan, antes de desplegar**
  - Confirmar con DrillChile la lista real de comunas atendidas y configurar `SOLAR_SERVICE_AREA_COMUNAS` en Easypanel con esos valores (Task 4) — sin esto, `service_area_match` es `false` para todo lead y ningún `QualifiedLead` pasa el gate automático (el override manual sigue disponible, pero degrada la operación a 100% manual).
  - Confirmar que al menos una persona del equipo de ventas de DrillChile sabe usar la card "Confirmación QualifiedLead (solar_res_v2)" del Contact profile (Task 8) — sin alguien revisando y confirmando, `QualifiedLead` deja de dispararse por completo (comportamiento esperado y correcto: ver `Task 5`, es la corrección del gap confirmado en Meta CAPI).

- [ ] **Step 2: Desplegar Backend con el endpoint nuevo y las correcciones de este plan.** Configurar en Easypanel las env vars de `SOLAR_API_KEY`, `SOLAR_WORKSPACE_ID`, `SOLAR_PIPELINE_ID`, `SOLAR_STAGE_ID` (ya documentadas) más `SOLAR_SERVICE_AREA_COMUNAS` (Step 1) con valores reales de producción, y desplegar la rama con los Tasks 1-9 de este plan mergeados sobre `feat/solar-metria-integration`. Antes de desplegar, confirmar en Meta Business Manager que existe una Custom Conversion sobre `QualifiedLead` con el ad set apuntando a optimizar hacia ella, y que la plantilla de confirmación de visita con los 2 botones Quick Reply está aprobada y asignada como `visitConfirmationTemplateId`.

- [ ] **Step 3: Desplegar solar apuntando al Backend de producción.** Confirmar que `C:\repo\drillchile\solar\src\app\actions.ts` en producción (Netlify/Vercel) tiene `METRIA_API_URL=https://<dominio-backend-metria>/api/public/solar/lead` y `METRIA_SOLAR_API_KEY=<mismo valor que SOLAR_API_KEY>` configurados — el código ya no referencia `GS_WEBHOOK_URL` (confirmado, commit `be1a64d` en el repo `solar`), así que este step es solo verificar las env vars del entorno de hosting, no un cambio de código.

- [ ] **Step 4: Ventana de verificación en paralelo (3-5 días).** Dejar el `SheetIntegration` de DrillChile **activo** (sigue sincronizando cada 5 min, sin tocarlo). Completar manualmente 2-3 wizards de prueba en producción y confirmar en Metria que:
  - El Contact aparece con `source: 'solar_direct'` inmediatamente (no esperar el cron).
  - El Deal se crea en el pipeline/stage correctos.
  - Los eventos `Contact`/`Lead` llegan a `ConversionEvent` con `status: 'sent'` y `action_source: 'website'`.
  - `qualificationData.solarResV2Criteria` queda calculado y visible en la card del Contact profile.
  - Al confirmar manualmente un lead que cumple los 4 criterios, `QualifiedLead` llega a `ConversionEvent` con `status: 'sent'`.
  - El handoff de WhatsApp dispara si el workspace tiene canal conectado.

- [ ] **Step 5: Desactivar el `SheetIntegration` de DrillChile.** Solo después de confirmar paridad en el Step 4 — vía UI de Metria (toggle "Activo") o `PATCH /api/sheets/:id` con `{isActive: false}` (`Backend/src/modules/sheets/sheets.routes.ts:96-107`, ya soporta este campo, sin cambio de código). No se borra el registro. Esto es suficiente para apagar el cron para DrillChile — `sheets.service.ts:393` ya filtra `where: { isActive: true }` (`syncAllActiveSheets`), confirmado en código: no hace falta ningún cambio adicional en `sheets.cron.ts`.

- [ ] **Step 6: Confirmar que el cron de Sheets sigue sano para otros clientes.** Revisar logs de `[SheetsSyncCron]` en producción — debe seguir corriendo cada 5 min sin errores para cualquier otra integración activa (no debería quedar ninguna después de este corte para DrillChile, pero el cron y el código quedan intactos para el próximo cliente que use planillas).

---

## Self-Review / cobertura contra los hallazgos confirmados

- `QualifiedLead` reactivado sin regla completa (contradicción dev3007 v1.1 vs spec 2-ago) → resuelto por Tasks 4-8: criterios automáticos + gate de validación humana obligatoria, sin auto-disparo.
- `event_source_url` ausente en CAPI → Task 1.
- `action_source='system_generated'` en vez de `'website'` para eventos web → Task 5.
- Contact/Lead emitidos sin exigir phone/email válido → Task 5.
- `consentVersion`/`consentAt` no validados como no-vacíos antes de enviar a Meta → Task 2.
- Token CAPI huérfano en `solar/.env.local` → fuera de este plan (no es código de este repo; es limpieza operativa de un archivo `.env.local` gitignoreado en `C:\repo\drillchile\solar`, recomendado hacer junto al Step 3 del Task 9 pero no bloqueante).
- Corte a producción / apagar Google Sheets para Solar → Task 9.
- Dashboard de cobertura CAPI (P1), `Metria_Event_Inbox`, `Purchase` con guardas de contrato → confirmados como fuera de alcance por los propios docs de dev3007 o ya cubiertos por infraestructura existente; no se agregan tasks nuevas para evitar exceder lo pedido.

**Consistencia de tipos:** `SolarResV2Criteria` (Task 4, `solarQualifier.ts`) se reusa sin cambios en `qualificationData.solarResV2Criteria` (Task 5), se lee con la misma forma en `confirmQualifiedLead` (Task 6) y en el Frontend (Task 8). Las firmas de `emitMetaContactEvent`/`emitMetaLeadEvent`/`emitMetaFinanceApplicationSubmittedEvent` (Task 3) se usan sin cambios en Task 5. `emitMetaQualifiedLeadEvent` (Task 3) se usa sin cambios en Task 6.
