# DrillChile: Google Calendar real + cierre de visitas técnicas desde leads del sheet

Fecha: 2026-07-19
Workspace: DrillChile (producción, login drillchilecl@gmail.com — Roberto Morales)

## Estado

Parte B implementada y con tests (2026-07-19) — ver "Notas de implementación" al final.
Parte A (reconectar Calendar / configurar slug de reservas) queda a cargo del usuario,
que lo hará al finalizar el desarrollo.

## Contexto

DrillChile ya tiene, en producción, la infraestructura completa para esto:
- Agente IA "Asistente DrillChile" (Gemini 2.5 Flash) con negocio, oferta (4 kits solares),
  7 preguntas de calificación, 6 objeciones (incl. financiamiento), agendamiento activado
  (tipos "Visita técnica" / "Llamada").
- Integración Google Sheets → CRM ("Solar", pipeline "Pipeline de Ventas → Lead"),
  sheet con 32 columnas que cubre datos de contacto, propiedad, techo, consumo eléctrico
  y elegibilidad de financiamiento (Ingreso Mensual, Deuda Casa, Valor Casa, Embargo Vigente).
  El sheet es exclusivo de leads solares (no perforación).
- Motor de Google Calendar por-workspace (OAuth, freeBusy, creación/cancelación de eventos)
  y página pública de reservas (`/book/[slug]`), ya usados por otros workspaces.

Lo que falta no es construir infraestructura nueva — es terminar de conectarla para
DrillChile y cerrar un bug de mapeo de datos que haría que el agente re-pregunte
información que el lead ya entregó en el sheet.

## Objetivo

Un lead que llega por el sheet de onboarding de DrillChile, con sus datos ya capturados,
debe: (1) crear el contacto/deal en el CRM sin re-preguntar lo ya sabido, (2) el agente de
WhatsApp solo completa lo que falta (day/time para la visita, resolver dudas de
financiamiento) y agenda la visita técnica, (3) la visita queda en el Google Calendar real
de drillchilecl@gmail.com y visible en "Citas" dentro de Metria.

## Hallazgos (estado real, verificado en el dashboard de producción)

1. **Google Calendar conectado a la cuenta equivocada** — `wario.jorquera@gmail.com`
   (cuenta personal de desarrollo) en vez de `drillchilecl@gmail.com`. 0 citas existentes
   hoy, así que reconectar no pierde nada.
2. **Página pública de reservas nunca configurada** — sin slug, sin duración guardada.
3. **Sync de sheets funciona pero el sheet está vacío** (solo headers, 0 filas de datos) —
   confirmado corriendo "Sync ahora" (0 importados, sin error). No es un bug.
4. **Bug real:** `sheets.service.ts` guarda las respuestas del sheet en
   `contact.qualificationData.rawFields` (keyed por el header de la columna, ej. `"Comuna"`).
   `promptCompiler.ts::pendingQualificationQuestions()` decide qué preguntar mirando
   `contact.qualificationData[q.key]` en la raíz, con keys como `location`, `roof_material`.
   Como los namespaces no calzan, el agente trataría a un lead-con-datos igual que a uno
   sin datos, y volvería a preguntar todo.

## Plan

### A. Config operativa (dashboard, hoy)
- Desconectar Google Calendar de `wario.jorquera@gmail.com`, reconectar con
  `drillchilecl@gmail.com` vía el flujo OAuth real ("Conectar Ahora" en Configuración Técnica).
- Configurar página de reservas: slug `drillchile`, duración según lo ya definido en
  Agendamiento (Visita técnica), título "Agenda una visita técnica" (ya sugerido).

### B. Fix de código (backend)
- Agregar `qualificationKeyMappings: Json?` a `SheetIntegration` (mismo patrón que
  `customFieldMappings`, que ya existe): mapea header-de-columna → key-de-calificación
  del agente (ej. `{"Comuna": "location", "Material Techo": "roof_material", "Tipo Propiedad":
  "property_type", "Relación Propiedad": "is_owner", "Monto Boleta": "monthly_bill",
  "Plazo Instalación": "timeline"}`).
- En `runSync()` (sheets.service.ts), además de `rawFields`, escribir esos valores
  resueltos en la raíz de `qualificationData` usando la key del agente — así
  `pendingQualificationQuestions()` los reconoce como ya respondidos.
- `financing` (contado/cuotas) NO se mapea desde el sheet — el sheet no tiene esa
  pregunta directa (solo datos de elegibilidad: ingreso, deuda, valor casa). El agente
  sigue preguntándola siempre, aunque el resto (6 de 7) se salte cuando venga del sheet.
- Configurar el `qualificationKeyMappings` real para la integración "Solar" existente
  (vía API autenticada, no hay UI de edición todavía — se agrega el campo al modelo
  pero no un editor visual en esta iteración, YAGNI hasta que se necesite editar seguido).

### C. Validación end-to-end
- Insertar una fila de prueba en el sheet "Solar" (datos ficticios, marcados como test)
  → Sync ahora → confirmar que el contacto se crea con `qualificationData` resuelto en
  la raíz.
- Conversación de prueba por WhatsApp (o preview del agente) → confirmar que NO
  repregunta comuna/techo/propiedad/boleta/plazo, sí pregunta financiamiento, y ofrece
  agendar la visita.
- Confirmar creación real del evento en el Google Calendar de `drillchilecl@gmail.com`
  y que aparece en Citas dentro de Metria.
- Borrar la fila y el contacto de prueba al terminar.

## Fuera de alcance
- Leads de perforación (Tipo Proyecto = Perforación): el usuario confirmó que este sheet
  es exclusivo de leads solares — no aplica filtrado ni agente separado en esta iteración.
- Editor visual de `qualificationKeyMappings` en el wizard de "Vincular planilla" — se
  configura vía API por ahora; se construye solo si se necesita editar seguido.
- Reconexión real de Google Calendar (OAuth con drillchilecl@gmail.com) y configuración
  de la página pública de reservas (slug `drillchile`) — el usuario las hará él mismo al
  terminar el desarrollo.

## Hallazgo adicional (durante la implementación)

`scheduleAppointment()` (usado por la herramienta `schedule_appointment` del agente de
WhatsApp) creaba la fila `Appointment` pero **nunca** sincronizaba con Google Calendar —
solo el flujo de reserva pública (`/book/:slug`) lo hacía, inline en su propia ruta. Es
decir: aunque se reconecte el Calendar real, ninguna visita agendada por el agente de
WhatsApp iba a aparecer en él. Se corrigió como parte de esta iteración (ver abajo) porque
sin esto "que el calendario funcione en paralelo" para el flujo que realmente importa acá
(WhatsApp) no se habría cumplido.

## Notas de implementación

- `SheetIntegration.qualificationKeyMappings` (Json?) agregado al schema.
  `npm run db:push` corrido contra la DB local de desarrollo (Docker Desktop se
  arrancó en esta sesión). **Falta correrlo contra la DB de producción** (Easypanel) —
  no tengo credenciales de esa DB desde acá; es parte del deploy normal del backend.
- `sheets.service.ts::runSync()` ahora resuelve `qualificationKeyMappings` (header de
  columna → key del agente) y las escribe en la raíz de `qualificationData` junto a
  `rawFields`. Solo aplica en la creación del contacto (igual que el resto de
  `qualificationData` hoy) — no se tocó el camino de actualización de contactos
  existentes, es comportamiento preexistente fuera de esta iteración.
- Extraído `syncAppointmentToCalendar()` en `google-calendar.service.ts` (antes esta
  lógica vivía solo inline en `public-booking.routes.ts`). Ahora la usan tanto la reserva
  pública como `schedule_appointment` del agente. Envuelto en try/catch en el call site
  del agente para que un fallo de Calendar/lookup de contacto nunca haga que el agente
  reporte la cita como fallida (la fila `Appointment` ya existe en ese punto).
- **Cerrado también** el gap de free/busy: nuevo `filterSlotsByCalendarBusy()` en
  `scheduling.service.ts`, usado por la herramienta `get_available_slots` del agente.
  Ahora el agente no ofrece (ni por lo tanto agenda) una hora que choque con algo ya
  puesto en el Google Calendar real conectado. No-op si no hay Calendar conectado;
  nunca lanza — un fallo de Calendar no debe bloquear al agente de ofrecer horarios.
- Tests: 8 nuevos/modificados (2 en `sheets.service.test.ts`, 3 en `ai.service.test.ts`,
  3 en `scheduling.service.test.ts`). 323/323 tests del backend en verde, `tsc --noEmit`
  limpio (4 errores preexistentes no relacionados), `npm run build` exitoso.
