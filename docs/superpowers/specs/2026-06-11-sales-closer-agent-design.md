# Spec: Agente Cerrador de Ventas (Fase 1)

**Fecha:** 2026-06-11
**Estado:** Aprobado por usuario (diseño verbal). Pendiente revisión de spec escrito.
**Objetivo:** Convertir el módulo de mensajería/CRM de Metria en el mejor gestor de WhatsApp para cierre de ventas: cualquier negocio programa su agente IA cerrador, el agente califica y etiqueta leads automáticamente, agenda visitas, hace follow-up y empuja deals hacia el cierre. Primer vertical: paneles solares.

## Contexto existente (no se reconstruye)

- WhatsApp doble vía: QR nativo (`whatsapp-web.js`, `Backend/src/lib/whatsapp/WhatsAppManager.ts`) + Cloud API (`Backend/src/modules/messaging/channels/whatsapp.service.ts`). Instagram y Telegram operativos.
- Agente IA Gemini 1.5 Flash en `Backend/src/modules/ai-agent/ai.service.ts` con tools: `qualify_lead`, `create_deal`, `move_deal`, `handover_to_human`, `search_catalog`.
- Motor de reglas (`flow.engine.ts`) como fallback si la IA falla.
- CRM: `Contact` (LEAD/PROSPECT/CUSTOMER), `ContactTag`, `Pipeline`/`PipelineStage`/`Deal`, `Ticket`, `ContactHealthScore`.
- Inbox unificado en tiempo real (Socket.io), UI de tags ya existente.
- Cron infra: `node-cron` (usado por analytics.cron.ts).
- Multi-tenancy: todo scoped a `workspaceId`.

## Decisiones de diseño

| Decisión | Elección |
|---|---|
| Alcance fase 1 | Agente cerrador IA completo (conocimiento + calificación + agenda + follow-ups) |
| LLM | Abstracción multi-proveedor; solo `GeminiProvider` implementado en fase 1 |
| Configuración del agente | Wizard guiado + subida de documentos (RAG); plantilla pre-cargada "Paneles Solares" |
| Calificación | Temperatura (COLD/WARM/HOT) + tipo (CURIOUS/QUOTING/READY_TO_BUY/POST_SALE) + score 0-100 |
| Agendamiento | Agenda interna propia (sin Google Calendar en fase 1) |
| Follow-ups | Secuencias configurables; el LLM redacta cada follow-up con contexto |
| RAG | Enfoque A: embeddings Gemini `text-embedding-004` como `Float[]` en Postgres, coseno en backend. Sin pgvector ni cambio de imagen Docker. Migrable a pgvector si escala. |

## Componentes

### 1. Abstracción multi-LLM

`Backend/src/modules/ai-agent/providers/`

```ts
interface LLMProvider {
  chat(input: {
    system: string;
    messages: ChatMessage[];          // role: 'user' | 'assistant'
    tools: ToolDeclaration[];
  }): Promise<{ text: string | null; toolCalls: ToolCall[] }>;
  embed(texts: string[]): Promise<number[][]>;
}
```

- `gemini.provider.ts`: refactor del código Gemini actual de `ai.service.ts`. Modelo chat `gemini-1.5-flash`, embeddings `text-embedding-004`.
- `provider.factory.ts`: resuelve provider por `BotAgent.provider` (campo existente, default `"gemini"`). Provider desconocido → error claro + fallback a reglas.
- `ai.service.ts` queda como orquestador: arma contexto, llama provider, ejecuta tools.

### 2. Base de conocimiento (RAG ligero)

Prisma:

```prisma
model KnowledgeDocument {
  id          String   @id @default(uuid())
  workspaceId String
  botAgentId  String?          // null = compartido por todos los agentes del workspace
  name        String
  sourceType  KnowledgeSourceType   // PDF | TEXT | FAQ
  status      KnowledgeStatus       // PROCESSING | READY | ERROR
  error       String?
  createdAt   DateTime @default(now())
  chunks      KnowledgeChunk[]
}

model KnowledgeChunk {
  id          String   @id @default(uuid())
  documentId  String
  workspaceId String
  content     String
  embedding   Float[]              // text-embedding-004, 768 dims
  order       Int
}
```

- Endpoints `/api/knowledge`: upload (multipart PDF o texto plano), list, delete. Plan-gated igual que `/api/bots` (`requirePlan('PRO','SCALE')`).
- Pipeline de ingesta: extracción de texto (`pdf-parse` para PDF) → chunking (~800 tokens, overlap 100) → `embed()` → persistir. Asíncrono: status PROCESSING → READY/ERROR.
- Retrieval en cada turno del agente: embedding del último mensaje del contacto → coseno contra chunks del workspace (cargados con cache Redis, key `kb:{workspaceId}`, invalidada al mutar documentos) → top-5 chunks sobre umbral 0.5 → bloque "CONOCIMIENTO DEL NEGOCIO" en el system prompt.
- Escala asumida fase 1: < 2.000 chunks por workspace. Si se supera, migrar a pgvector (documentado, fuera de alcance).

### 3. Wizard "Programa tu agente"

Frontend: `/dashboard/bots/[botId]/setup` (nueva página, client component).

Pasos:
1. **Negocio**: qué vende, propuesta de valor, zona de cobertura.
2. **Oferta**: productos/servicios con precios o rangos.
3. **Calificación**: preguntas que el agente debe hacer (editable; pre-cargadas por plantilla).
4. **Objeciones**: pares objeción → respuesta sugerida.
5. **Agendamiento**: tipos de cita (visita técnica / llamada), duración, horarios.
6. **Persona**: nombre del agente, tono (reusa `BotAgent.tone`), idioma.
7. **Documentos**: upload a base de conocimiento.

- Output: `agentProfile` JSON persistido en `BotAgent.config.profile` (campo `config` Json existente). Sin migración de schema para esto.
- **Plantilla "Paneles Solares"** (constante en backend, aplicable desde el wizard): preguntas de calificación (consumo mensual kWh o monto de cuenta de luz, tipo de propiedad y techo, ¿es propietario?, comuna/ubicación, interés en financiamiento), objeciones típicas (precio alto, payback, durabilidad, permisos), etapas de cierre orientadas a agendar visita técnica.
- Cada `page.tsx` exporta `Metadata`. Patrón Mounted para stores Zustand.

### 4. Motor de calificación

Prisma — `Contact` gana campos:

```prisma
leadScore         Int?
leadTemperature   LeadTemperature?   // COLD | WARM | HOT
leadType          LeadType?          // CURIOUS | QUOTING | READY_TO_BUY | POST_SALE
qualificationData Json?              // respuestas a preguntas del vertical
```

Nuevas tools del agente:
- `update_qualification(contactId, temperature, type, score, data)` — actualiza campos; emite evento socket para refresco del inbox/CRM.
- `tag_contact(contactId, name, color?)` — crea `ContactTag` (modelo existente, unique contactId_name → upsert).

Reglas de prompt: el agente debe recalificar cuando obtiene una respuesta a pregunta de calificación o detecta cambio de intención. `qualify_lead` existente (LEAD/PROSPECT/CUSTOMER) se mantiene; `update_qualification` lo complementa, no lo reemplaza.

UI: badges de temperatura/tipo/score en `ConversationList`, `ContactPanel` y perfil de contacto (`/dashboard/crm/contacts/[contactId]`). Filtros por temperatura/tipo en lista CRM.

### 5. Agenda interna

Prisma:

```prisma
model AvailabilityRule {
  id          String  @id @default(uuid())
  workspaceId String
  dayOfWeek   Int                  // 0-6
  startTime   String               // "09:00"
  endTime     String               // "18:00"
  slotMinutes Int     @default(60)
  apptType    AppointmentType      // SITE_VISIT | CALL
}

model Appointment {
  id           String   @id @default(uuid())
  workspaceId  String
  contactId    String
  dealId       String?
  type         AppointmentType
  scheduledAt  DateTime
  durationMin  Int      @default(60)
  status       AppointmentStatus   // SCHEDULED | CONFIRMED | COMPLETED | CANCELLED | NO_SHOW
  notes        String?
  createdBy    String              // 'BOT' | userId
  createdAt    DateTime @default(now())
}
```

- Tool `schedule_appointment(contactId, isoDateTime, type)`: valida contra `AvailabilityRule` + colisiones existentes; crea cita; mensaje de confirmación al contacto; notificación socket al workspace; nota interna en la conversación.
- Tool `get_available_slots(type, fromDate)`: próximos N slots libres para que el agente los ofrezca.
- Endpoints `/api/appointments`: CRUD + listado por rango.
- Frontend: sección "Citas" en CRM (lista simple por fecha, cambio de estado). Kanban/calendario completo = fase 2.

### 6. Follow-ups automáticos

Prisma:

```prisma
model FollowUpRule {
  id          String  @id @default(uuid())
  workspaceId String
  botAgentId  String
  delayHours  Int                  // ej: 4, 24, 72
  order       Int                  // posición en la secuencia
  isActive    Boolean @default(true)
}

model FollowUpJob {
  id             String   @id @default(uuid())
  workspaceId    String
  conversationId String
  ruleId         String
  scheduledAt    DateTime
  status         FollowUpStatus    // PENDING | SENT | CANCELLED
  sentAt         DateTime?
}
```

- Trigger: al enviar el bot un mensaje OUTBOUND en conversación `isHandledByBot`, se programa el job de la primera regla activa. Si el contacto responde, jobs PENDING de esa conversación → CANCELLED. Si un follow-up se envía y sigue sin respuesta, se encadena la siguiente regla.
- Cron cada 15 min (`followup.cron.ts`): toma jobs PENDING vencidos → LLM redacta follow-up con contexto de la conversación + estado de calificación → envía por el canal de origen → marca SENT.
- Guardrails: solo dentro de business hours (`businessHours.service.ts` existente), máx. 1 follow-up por conversación por día, secuencia termina al agotar reglas. Idempotencia: el job se marca SENT (update condicional sobre status PENDING) antes de despachar el mensaje, para evitar doble envío si el cron se solapa.

### 7. Compilador de playbook

`Backend/src/modules/ai-agent/promptCompiler.ts` — función pura:

```
compileSystemPrompt({ profile, knowledgeChunks, contact, deal, stage }) → string
```

Estructura del prompt resultante:
1. Identidad y tono del agente (de `BotAgent` + profile).
2. Contexto del negocio y oferta (del wizard).
3. Conocimiento recuperado (chunks RAG).
4. Estado actual del lead: calificación, etapa del deal, citas existentes.
5. Playbook de cierre por etapas: saludo → descubrimiento (preguntas de calificación pendientes) → presentación de solución → manejo de objeciones (pares del wizard) → cierre (agendar visita / crear-mover deal).
6. Reglas duras: no inventar precios fuera de la oferta, escalar a humano (`handover_to_human`) ante enojo o solicitud explícita, no prometer lo que no está en el conocimiento.

El compilador identifica qué preguntas de calificación faltan (comparando `qualificationData` con el profile) e instruye al agente a obtenerlas de forma natural, no como interrogatorio.

### 8. Manejo de errores y testing

- LLM falla → fallback al motor de reglas existente (cadena ya implementada en message flow).
- Toda tool valida `workspaceId` del recurso antes de mutar (multi-tenancy).
- Ingesta de documentos: errores quedan en `KnowledgeDocument.error`, status ERROR, visible en wizard.
- Tests (vitest, patrón existente):
  - `promptCompiler` — output correcto por combinaciones de profile/estado.
  - Handlers de tools nuevas (`update_qualification`, `tag_contact`, `schedule_appointment`, `get_available_slots`) — incl. validación de tenancy y colisión de citas.
  - Scheduler de follow-ups — programación, cancelación al responder, guardrails.
  - `provider.factory` + `GeminiProvider` con mock del SDK.
  - Chunking y coseno del retrieval.

## Fuera de alcance (roadmap fases siguientes)

- Proveedores Claude/OpenAI (solo interfaz preparada).
- Canales email, SMS, widget web, Messenger completo.
- Google Calendar, generación de cotizaciones PDF, forecasting de pipeline.
- pgvector, A/B testing de prompts, atribución de campañas a cierre.

## Criterios de éxito

1. Un negocio nuevo completa el wizard (con plantilla solar) y su agente responde por WhatsApp con conocimiento de sus documentos.
2. El agente etiqueta automáticamente temperatura/tipo/score visibles en inbox y CRM.
3. El agente agenda una visita técnica válida contra la disponibilidad configurada.
4. Un lead que no responde recibe follow-up contextual dentro de la cadencia configurada y en horario hábil.
5. Tests backend en verde (89 existentes + nuevos).
