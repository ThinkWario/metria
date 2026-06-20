# Sprint 3A Design — Email Tracking + Drip + Wait-for-Reply + Form Conditionals

**Date:** 2026-06-20  
**Scope:** 4 features de mayor ROI para cerrar brecha vs GHL en Campañas (6→7→9), Automatización (7→8.5) y Forms (7→8.5)  
**Repo:** `C:\Proyectos\Metria` (monorepo Backend + Frontend)

---

## Context

Metria ya tiene: motor de campañas batch (Resend/Twilio), workflows node-based con `wait` por tiempo y `branch`, form builder con submit → trigger de workflow. Lo que falta para paridad con GHL:

| Gap | Target |
|-----|--------|
| Sin pixel de apertura ni redirect de click | Campañas → OPENED/CLICKED en DB |
| Sin acción "enviar campaña" en workflows | Drip sequences |
| Solo `wait` por tiempo, no por evento | `wait_for_reply` node |
| FormField sin visibilidad condicional | show/hide reactivo |

---

## Feature 1 — Email Tracking Pixel + Click Tracking

### Endpoints (Backend)

Nuevo módulo `Backend/src/modules/tracking/`:

```
GET /t/o/:recipientId
  → Valida recipientId existe en CampaignRecipient
  → Si status !== OPENED: UPDATE status='OPENED', openedAt=now()
  → Siempre responde: 200, Content-Type: image/gif, body: 1×1 GIF transparente (35 bytes)
  → Sin autenticación (pixel embebido en email)

GET /t/c/:recipientId?url=<encoded>
  → Valida recipientId + url (debe ser http/https, max 2048 chars)
  → Si status !== CLICKED: UPDATE status='CLICKED', clickedAt=now()
  → Responde: 302 Location: url decodificada
  → Sin autenticación
```

### Inyección en send (campaigns.service.ts)

En `sendCampaign()`, después de `renderMergeTags()`, si `channel === 'EMAIL'`:

1. Reescribir cada `href` en el HTML:
   ```
   href="https://original.com/path"
   → href="https://api.domain.com/t/c/RECIPIENT_ID?url=encodeURIComponent(original)"
   ```
2. Append antes de `</body>` (o al final si no existe):
   ```html
   <img src="https://api.domain.com/t/o/RECIPIENT_ID" width="1" height="1" style="display:none" alt="" />
   ```
3. Base URL de tracking desde `process.env.API_BASE_URL` (ya existe para webhooks).

### Stats enriquecidas

`GET /api/campaigns/:id/stats` — responde:
```json
{
  "total": 120,
  "sent": 118,
  "failed": 2,
  "opened": 45,
  "clicked": 12,
  "openRate": 0.381,
  "clickRate": 0.102
}
```
Calculado con `COUNT` agrupado desde `CampaignRecipient` (no desnormalizado en `Campaign.stats`).

### Schema — sin cambios

`CampaignRecipient` ya tiene: `status` (incluye `OPENED|CLICKED`), `openedAt`, `sentAt`. Solo falta `clickedAt DateTime?` nuevo campo.

---

## Feature 2 — Drip Sequences (acción `send_campaign`)

### Nueva acción en executor.ts

```typescript
case 'send_campaign': {
  const { campaignId } = cfg as { campaignId: string }
  if (!campaignId) { log.push('send_campaign: no campaignId'); break }
  await campaignsService.sendToSingleContact({ campaignId, contactId, workspaceId })
  log.push(`send_campaign: sent campaign ${campaignId}`)
  break
}
```

### Nuevo método en campaigns.service.ts

```typescript
async sendToSingleContact(params: {
  campaignId: string
  contactId: string
  workspaceId: string
}): Promise<void>
```

- Crea un `CampaignRecipient` (status=PENDING) para ese contacto + campaña
- Llama al driver correspondiente inmediatamente (no batch)
- Marca status=SENT o FAILED
- No actualiza `Campaign.status` (la campaña principal puede estar SENT, esto es un envío adicional)

### Uso en frontend — nodo nuevo en workflow builder

Tipo: `send_campaign`  
Config fields: `{ campaignId: string }` con select de campañas del workspace  
Label display: `"Enviar: [nombre campaña]"`

### Patrón drip completo

Un drip es un workflow estándar:
```
TRIGGER: FORM_SUBMITTED
→ send_campaign (id: "bienvenida")
→ wait (hours: 24)
→ send_campaign (id: "followup-1")
→ wait (hours: 48)
→ send_campaign (id: "followup-2")
```

No requiere modelo nuevo. El builder ya soporta múltiples nodos.

---

## Feature 3 — Nodo `wait_for_reply`

### Schema — WorkflowRun

Cambios en Prisma:
```prisma
model WorkflowRun {
  // campos existentes...
  status    String  // añadir 'WAITING_FOR_REPLY' al conjunto de valores
  meta      Json?   // NUEVO campo nullable — almacena waitingForContactId y otros
}
```

### Nueva acción en executor.ts

```typescript
case 'wait_for_reply': {
  const { timeoutHours = 24 } = cfg as { timeoutHours?: number }
  const resumeAt = new Date(Date.now() + Math.max(timeoutHours, 1) * 3_600_000)
  await prisma.workflowRun.update({
    where: { id: runId },
    data: {
      status: 'WAITING_FOR_REPLY',
      cursor: i + 1,
      resumeAt,
      meta: { ...(run.meta as object ?? {}), waitingForContactId: contactId },
      log
    }
  })
  return  // pausar ejecución
}
```

### Resume en dispatcher.ts

Cuando llega evento `MESSAGE_RECEIVED` con `{ contactId, workspaceId }`:

```typescript
// Buscar runs esperando respuesta de este contacto
const waitingRuns = await prisma.workflowRun.findMany({
  where: {
    workspaceId,
    status: 'WAITING_FOR_REPLY',
    meta: { path: ['waitingForContactId'], equals: contactId }
  }
})
for (const run of waitingRuns) {
  await startRun(run.id)  // reanuda desde run.cursor
}
```

### Cron de timeout (automation.cron.ts) — sin cambios

El cron ya revisa `resumeAt <= now()` para runs en `WAITING`. Debe extenderse para incluir `WAITING_FOR_REPLY`:

```typescript
where: {
  status: { in: ['WAITING', 'WAITING_FOR_REPLY'] },
  resumeAt: { lte: new Date() }
}
```

Cuando el cron reanuda un run por timeout (no por reply), el workflow continúa normalmente. Si se quiere ramificación "¿respondió o no?", eso se hace con un `branch` posterior (fuera de scope de este sprint).

### Frontend — nodo nuevo en builder

Tipo: `wait_for_reply`  
Config: `{ timeoutHours: number }` — default 24  
Display: `"Esperar respuesta (máx Xh)"`

---

## Feature 4 — Condicionales show/hide en Forms

### Tipos (compartidos Backend + Frontend)

```typescript
export type ConditionOp = 'eq' | 'neq' | 'contains'

export interface FieldCondition {
  fieldId: string   // ID del campo que se observa
  op: ConditionOp
  value: string     // valor esperado (string siempre, comparación case-insensitive)
}

export interface FormField {
  id: string
  label: string
  type: 'text' | 'email' | 'tel' | 'textarea' | 'select'
  required: boolean
  options?: string[]
  conditions?: FieldCondition[]  // NUEVO — undefined/[] = siempre visible
}
```

Semántica: **AND** de todas las condiciones. Si `conditions` está vacío o undefined → visible. Si alguna condición falla → oculto + valor limpiado.

### Backend — validación en submit

En `public-forms.routes.ts` / `forms.service.ts`, al procesar submission:

1. Evaluar visibilidad de cada field con los valores recibidos.
2. Ignorar validación de fields hidden (no required check, no type check).
3. Excluir valores de fields hidden del objeto guardado en `FormSubmission.data`.

```typescript
function isFieldVisible(field: FormField, values: Record<string, string>): boolean {
  if (!field.conditions?.length) return true
  return field.conditions.every(cond => {
    const actual = (values[cond.fieldId] ?? '').toLowerCase()
    const expected = cond.value.toLowerCase()
    switch (cond.op) {
      case 'eq':       return actual === expected
      case 'neq':      return actual !== expected
      case 'contains': return actual.includes(expected)
    }
  })
}
```

### Frontend — evaluación reactiva

En `/f/[slug]` (public form page):

```typescript
// Estado
const [values, setValues] = useState<Record<string, string>>({})

// Visibilidad
function isVisible(field: FormField): boolean {
  if (!field.conditions?.length) return true
  return field.conditions.every(c => {
    const v = (values[c.fieldId] ?? '').toLowerCase()
    const exp = c.value.toLowerCase()
    if (c.op === 'eq') return v === exp
    if (c.op === 'neq') return v !== exp
    if (c.op === 'contains') return v.includes(exp)
    return true
  })
}

// Render
{form.fields.map(field =>
  isVisible(field) ? <FormFieldComponent key={field.id} field={field} ... /> : null
)}

// On submit: enviar solo values de campos visibles
const visibleValues = Object.fromEntries(
  form.fields
    .filter(f => isVisible(f))
    .map(f => [f.id, values[f.id] ?? ''])
)
```

### Form Builder UI — editor de condiciones

En el panel de edición de un field, sección colapsable "Mostrar si...":
- Botón "Añadir condición" → agrega `FieldCondition` al array
- Selector de field (todos los fields del form excepto el actual)
- Selector de operador: `es igual a / no es igual a / contiene`
- Input de valor
- Botón eliminar por condición

---

## Data Model Changes (Prisma)

```prisma
// CampaignRecipient — añadir campo
model CampaignRecipient {
  // ... existentes
  clickedAt   DateTime?   // NUEVO
}

// WorkflowRun — añadir campo
model WorkflowRun {
  // ... existentes
  meta        Json?       // NUEVO — { waitingForContactId?: string }
}
```

Solo 2 columnas nuevas. No cambia ninguna columna existente.

---

## Files to Create / Modify

### Backend

| Archivo | Acción |
|---------|--------|
| `src/modules/tracking/tracking.routes.ts` | CREAR — endpoints /t/o/:id y /t/c/:id |
| `src/modules/tracking/tracking.service.ts` | CREAR — lógica pixel + redirect + update DB |
| `src/app.ts` | MODIFICAR — registrar tracking routes |
| `src/modules/campaigns/campaigns.service.ts` | MODIFICAR — inyección pixel en send + sendToSingleContact() |
| `src/modules/automation/executor.ts` | MODIFICAR — cases send_campaign + wait_for_reply |
| `src/modules/automation/dispatcher.ts` | MODIFICAR — resume on MESSAGE_RECEIVED |
| `src/modules/automation/automation.cron.ts` | MODIFICAR — incluir WAITING_FOR_REPLY en cron query |
| `src/modules/crm/forms.service.ts` / `public-forms.routes.ts` | MODIFICAR — validación condicional en submit |
| `prisma/schema.prisma` | MODIFICAR — clickedAt + meta |

### Frontend

| Archivo | Acción |
|---------|--------|
| `src/types/form.ts` o equivalente | MODIFICAR — añadir FieldCondition + conditions a FormField |
| `src/app/f/[slug]/page.tsx` | MODIFICAR — evaluación reactiva de visibilidad |
| `src/components/forms/FormBuilder.tsx` o equivalente | MODIFICAR — editor de condiciones en panel de field |
| `src/components/automation/WorkflowBuilder.tsx` | MODIFICAR — nodos send_campaign + wait_for_reply |
| `src/app/dashboard/campaigns/[id]/page.tsx` | MODIFICAR — mostrar stats openRate/clickRate |

---

## Out of Scope (Sprint 3A)

- Email inbound (bidireccional) — Sprint 3B
- SMS bidireccional — Sprint 3B  
- Unsubscribe link automático — Sprint 3B
- Branch condicional post-wait_for_reply ("¿respondió sí/no?") — Sprint 3C
- Form multi-step — Sprint 3C

---

## Success Criteria

1. Enviar campaña EMAIL → abrir el email → DB muestra `openedAt` y `status=OPENED`
2. Clickear link en email → DB muestra `clickedAt` y `status=CLICKED`, usuario llega a URL destino
3. Stats endpoint devuelve `openRate` y `clickRate` correctos
4. Workflow con nodo `send_campaign` dispara campaña a un contacto individual
5. Workflow con `wait_for_reply` pausa hasta que el contacto envía mensaje (o timeout)
6. Form con condición: campo B solo aparece si campo A = "X"; al enviar, campos ocultos no van al servidor
7. `prisma db push` corre sin errores; build backend limpio; build frontend limpio
