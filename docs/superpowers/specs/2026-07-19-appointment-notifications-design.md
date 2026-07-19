# Notificación de WhatsApp al agendar / reagendar una cita

Fecha: 2026-07-19
Workspace: aplica a cualquier workspace con Calendar/booking activo (motivado por DrillChile)

## Objetivo

Cuando se crea o reagenda una cita (visita técnica / llamada), notificar por WhatsApp:
1. Al **lead** (contacto) — confirmación de su hora.
2. A un **número interno** del workspace (ej. el dueño/técnico) — aviso de la cita nueva o el cambio.

## Contexto / estado actual

- El motor de citas (`scheduling.service.ts`) hoy solo soporta **crear** citas
  (`scheduleAppointment`) y **cambiar status** (`updateAppointmentStatus`: CONFIRMED,
  CANCELLED, etc). No existe un concepto de "reagendar" — mover la hora de una cita
  existente.
- Dos caminos generan citas hoy:
  - Agente IA de WhatsApp, tool `schedule_appointment` (`ai.service.ts`).
  - Página pública de reservas `/book/:slug` (`public-booking.routes.ts`), Calendly-style.
- Ninguno de los dos envía ninguna notificación por WhatsApp al crear una cita — solo
  sincronizan a Google Calendar (best-effort, `syncAppointmentToCalendar`) y emiten un
  evento de socket para el dashboard.
- `sendPlatformMessage(platform, config, to, text, workspaceId)` en `message.service.ts`
  ya resuelve el envío correcto según canal conectado (Cloud API vs WhatsApp nativo por
  QR) pero hoy es privada del módulo — hay que exportarla.
- `sendOutboundPlatformMessage(workspaceId, conversationId, text)` ya envía + persiste +
  emite socket para un mensaje dentro de una conversación existente — se reusa para la
  confirmación al lead cuando viene del agente IA (ya hay `conversationId`).

## Diseño

### 1. Modelo de datos

- `Workspace.notifyPhone String?` — número interno a notificar. Un solo número por
  workspace (no se modela una tabla de destinatarios múltiples — YAGNI hasta que se
  necesite notificar a más de una persona).
- `Appointment` no cambia de forma. Reagendar es un `UPDATE` de `scheduledAt` sobre la
  misma fila (no se crea una fila nueva, no se persiste historial de reagendamientos).

### 2. Reagendamiento real (`reschedule_appointment`)

Nueva función `rescheduleAppointment(workspaceId, appointmentId, newScheduledAt)` en
`scheduling.service.ts`:
- Busca la cita por `id` + `workspaceId`; falla si no existe o si su `status` no es
  `SCHEDULED`/`CONFIRMED` (no se reagenda una cita cancelada o completada).
- Reusa la validación de `AvailabilityRule` (hora dentro de una regla vigente) y de
  colisión con otras citas del mismo día, igual que `scheduleAppointment`.
- Actualiza `scheduledAt` (y `durationMin` si la regla que matchea la nueva hora tiene
  otra duración). Devuelve también el `oldScheduledAt` (leído antes del update) para que
  el caller arme el texto de notificación — no se persiste en DB.
- Si la cita tiene `googleEventId`, actualiza el evento en Calendar: nuevo
  `updateCalendarEvent(workspaceId, googleEventId, { startAt, durationMin })` en
  `google-calendar.service.ts` (análogo a `cancelCalendarEvent`, que ya existe).
  Best-effort — try/catch, un fallo de Calendar no revierte el reagendamiento en Metria.

Nueva tool del agente IA en `ai.service.ts`, junto a `get_available_slots` /
`schedule_appointment`:

```
reschedule_appointment(newIsoDateTime: string)
```

El agente no le pide el `appointmentId` al lead (mala UX) — el tool handler resuelve
la cita activa buscando el `Appointment` `SCHEDULED`/`CONFIRMED` más próximo en el
tiempo para ese `contactId` dentro del workspace. Si no hay ninguna, devuelve error
(`{ error: 'No hay cita activa para reagendar' }`) y el agente se lo comunica al lead.

### 3. Módulo de notificación

Nuevo archivo `modules/scheduling/appointment-notifications.service.ts`:

```ts
type AppointmentEventKind = 'created' | 'rescheduled'

async function notifyAppointmentEvent(
  workspaceId: string,
  params: {
    contact: { id: string; name: string; phone: string | null }
    appointment: { type: string; scheduledAt: Date; durationMin: number }
    kind: AppointmentEventKind
    oldScheduledAt?: Date        // requerido si kind === 'rescheduled'
    conversationId?: string      // si viene del agente IA, para loguear la confirmación en el chat
  }
): Promise<void>
```

Comportamiento:
- Resuelve el `Channel` WHATSAPP del workspace
  (`prisma.channel.findFirst({ where: { workspaceId, platform: 'WHATSAPP' } })`). Si no
  hay canal conectado, no hace nada (no lanza).
- **Aviso interno**: si `workspace.notifyPhone` está seteado, arma el texto interno
  (ver sección 4) y lo envía con `sendPlatformMessage(channel.platform, channel.config,
  workspace.notifyPhone, text, workspaceId)` — mensaje suelto, no ligado a ninguna
  conversación (el número interno no es un `Contact` del CRM).
- **Confirmación al lead**:
  - Si viene `conversationId` (camino agente IA) → `sendOutboundPlatformMessage(workspaceId,
    conversationId, text)`. Queda en el historial del chat, visible en el inbox del CRM,
    emite el socket `message:new` como cualquier respuesta del bot.
  - Si no viene `conversationId` (camino booking público) → mensaje suelto con
    `sendPlatformMessage` directo a `contact.phone`, sin crear ni loguear una
    conversación. Decisión de scope: integrar esto al inbox (crear/encontrar la
    conversación) es una iteración aparte si se pide más adelante.
- Cada envío (interno y lead) va en su propio try/catch — un fallo en uno no bloquea el
  otro, y ningún fallo de notificación revierte ni marca como fallida la cita. Los
  errores se loguean con `console.error`, mismo patrón que `syncAppointmentToCalendar`.

`sendPlatformMessage` se exporta desde `message.service.ts` (hoy es función privada del
módulo) para poder reusarla acá sin duplicar la lógica de resolución de canal
(Cloud API vs WhatsApp nativo QR).

### 4. Contenido de los mensajes

Fecha/hora formateadas en el timezone del workspace (`BusinessHours.timezone`, mismo
patrón que ya usa `scheduling.service.ts`; fallback `America/Santiago` si no hay
`BusinessHours` configurado).

| Destinatario | Evento | Texto |
|---|---|---|
| Lead | creada | "Tu visita técnica quedó agendada para el {fecha} a las {hora}. Cualquier cambio, escríbenos por aquí." |
| Lead | reagendada | "Tu visita técnica fue reagendada: ahora es el {fecha} a las {hora} (antes: {fechaAnterior} {horaAnterior})." |
| Interno | creada | "Nueva cita — {nombreContacto} ({teléfono}), {tipo}, {fecha} {hora}." |
| Interno | reagendada | "Cita reagendada — {nombreContacto} ({teléfono}), {tipo}: de {fechaAnterior} {horaAnterior} a {fecha} {hora}." |

`{tipo}` mapea `SITE_VISIT` → "Visita técnica", `CALL` → "Llamada", cualquier otro
(ej. `PUBLIC_BOOKING_TYPE`) usa un label genérico "Cita".

### 5. Triggers (dónde se llama `notifyAppointmentEvent`)

- `ai.service.ts`, case `schedule_appointment`: después de crear el `Appointment` y del
  intento de sync a Calendar (mismo bloque try/catch no-bloqueante) → `kind: 'created'`,
  con `conversationId` del caso.
- `ai.service.ts`, nuevo case `reschedule_appointment`: después del update → `kind:
  'rescheduled'`, con `conversationId` del caso y `oldScheduledAt` devuelto por
  `rescheduleAppointment`.
- `public-booking.routes.ts`, dentro de la sección de tareas post-booking no-bloqueantes
  (junto al `syncAppointmentToCalendar` existente) → `kind: 'created'`, sin
  `conversationId`.

### 6. Frontend

`BookingConfigCard.tsx` (`metria-metrics/Frontend/src/app/dashboard/crm/appointments/`):
agrega un campo "Número interno a notificar" (`Input` con placeholder
`+56 9 1234 5678`), guardado junto a slug/título/duración en el mismo submit.

`PATCH /scheduling/booking-config` (`scheduling.routes.ts`) extiende el body para
aceptar `notifyPhone?: string | null` — trim, string vacío se guarda como `null`, sin
validación estricta de formato (el placeholder ya guía el formato esperado).

## Riesgos conocidos (fuera de alcance de esta iteración)

- **Ventana de 24h de WhatsApp Cloud API**: Meta solo permite mensajes de texto libre
  (no-template) a un número que le escribió al bot en las últimas 24h. El `notifyPhone`
  interno probablemente nunca le escribió al número del bot de WhatsApp → el primer
  aviso puede fallar (la API de Meta devuelve error, queda logueado en consola vía el
  try/catch no-bloqueante, no rompe el agendamiento). Mitigación real (plantilla de
  WhatsApp aprobada, HSM) no se construye en esta iteración — se revisita si se confirma
  que efectivamente falla en producción.
- Citas creadas manualmente desde el dashboard (`POST /appointments`, autenticado, uso
  interno del equipo) no disparan notificación — quien las crea ya sabe que las creó.
- Cambios de `status` vía `PATCH /appointments/:id/status` (CONFIRMED, CANCELLED,
  NO_SHOW, COMPLETED) no disparan notificación — esta iteración cubre solo creación y
  reagendamiento de hora.

## Validación end-to-end

- Reagendar desde el agente IA (preview o WhatsApp real) → confirmar `UPDATE` en
  `Appointment` (misma fila, `id` no cambia), evento de Calendar actualizado (si había
  `googleEventId`), mensaje de confirmación en el chat del lead, aviso en `notifyPhone`.
- Crear cita vía `/book/:slug` → confirmar mensaje suelto al lead + aviso a
  `notifyPhone`, sin conversación nueva creada en el CRM.
- `notifyPhone` vacío → no se envía aviso interno, sin error.
- Sin canal WHATSAPP conectado en el workspace → `notifyAppointmentEvent` no hace nada,
  el agendamiento/reagendamiento se completa igual.
