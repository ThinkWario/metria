# Diseño: Integración directa Solar ↔ Metria (sin Google Sheets)

**Fecha:** 2026-08-01
**Estado:** Aprobado para plan de implementación
**Repos involucrados:** `Backend/` (Metria, este repo) y `C:\repo\drillchile\solar` (repo aparte, sin cambios de topología)

## Contexto

Solar (quote wizard de DrillChile: cotizaciones de paneles solares, perforación, financiamiento) es un Next.js standalone sin base de datos propia. Hoy persiste todo el progreso del lead en una planilla de Google Sheets a través de un webhook de Google Apps Script (`GS_WEBHOOK_URL`), usando `action: "save"` en cada paso y `action: "complete"` al finalizar, todo indexado por un `sessionId` guardado en cookie.

Metria (`Backend/src/modules/sheets/sheets.cron.ts`) lee esa misma planilla cada 5 minutos vía Google Sheets API (`sheets.service.ts`), mapea columnas → campos de `Contact` según `fieldMappings` configurados en `SheetIntegration`, califica el lead, crea `Deal`, dispara eventos Meta CAPI (`Contact`, `Lead`, `FinanceApplicationSubmitted`) y hace handoff a WhatsApp si corresponde.

Problemas del diseño actual:
- Latencia de hasta 5 minutos entre que el lead completa el wizard y aparece en el CRM / dispara CAPI (afecta Event Match Quality en Meta).
- Google Sheets como base de datos: sin transacciones, sin validación de esquema, dependiente de que la hoja esté compartida "Anyone with the link" (ya causó el error `SHEET_PERMISSION_DENIED`).
- Mapeo de columnas por nombre de header es fragil (cualquier rename de columna en la hoja rompe el import) para un dato que en realidad ya es un objeto tipado (`StepData`) del lado de solar.
- La planilla es también el único lugar donde alguien del equipo revisa manualmente el detalle de cada lead (paso a paso, financiamiento, ubicación) — no hay equivalente en Metria hoy.

## Decisión de alcance

- **Solo DrillChile por ahora** — no se construye un sistema multi-tenant genérico de "quote wizards"; la integración puede asumir un único workspace.
- **Repos separados** — solar mantiene su propio repo y su propio deploy (Netlify/Vercel). Metria mantiene el suyo (Backend en Easypanel). No hay monorepo, no hay Prisma client compartido. El único contrato entre ambos es el JSON del endpoint HTTP nuevo.

## Arquitectura

```
solar (repo propio, Next.js, server actions en src/app/actions.ts)
   │  POST https://api.metria.com/api/public/solar/lead
   │       body: { action: "save"|"complete", sessionId, ...StepData }
   │  GET  https://api.metria.com/api/public/solar/lead?sessionId=...
   │  header: X-Solar-Api-Key: <secreto compartido, env var en ambos repos>
   ▼
Backend Metria (Express, este repo) — endpoint público nuevo
   │
   ▼
leadIngestion.service.ts — lógica extraída del loop de sheets.service.ts,
reusada por el import genérico de Sheets Y por este endpoint directo
   → upsert Contact (dedupe por email/phone, tag "Incompleto" si es parcial)
   → qualifyLead específico de solar (reglas determinísticas, sin mapeo de columnas)
   → Deal en pipeline/stage fijos (env vars, single-tenant)
   → emitMetaContactEvent / emitMetaLeadEvent / emitMetaFinanceApplicationSubmittedEvent
     (consent-gated, mismo event_id por Contact.id que ya existe hoy)
   → prepareWhatsappConversation (handoff a agente IA, sin cambios)
```

No hay DB compartida. Solar nunca toca Postgres — sigue el mismo patrón que ya usa el Frontend de Metria (todo pasa por la API del Backend).

## Componentes

### Backend (este repo)

- **`Backend/src/modules/leads/leadIngestion.service.ts`** (nuevo): extrae de `sheets.service.ts` la lógica por-lead que hoy vive dentro del loop `for (const row of rows)` — dedupe por email/phone, gate de consentimiento, creación de `Contact`, creación de `Deal`, disparo de eventos CAPI, handoff de WhatsApp — como funciones puras reusables que reciben un objeto de datos ya resuelto (no una fila de spreadsheet). `sheets.service.ts` se refactoriza para llamar estas mismas funciones, de modo que el importador genérico de Sheets (usado por futuros clientes que sí necesiten mapeo de columnas) no se duplica ni diverge.

  **Importante:** esta extracción cubre el camino de `complete` (equivalente a una fila ya resuelta y completa, igual que hoy). El camino de `save` (progresivo, múltiples llamadas por wizard actualizando el mismo lead) **no existe hoy en ninguna forma** — `sheets.service.ts` solo crea un Contact una vez por `sessionId` y salta cualquier fila ya vista (`importedIds.has(sessionId)`), nunca actualiza uno existente con datos nuevos. La lógica de merge progresivo por `sessionId` es trabajo nuevo, no una extracción, y debe dimensionarse como tal en el plan de implementación.

- **Cambio de schema necesario**: `Contact.sessionId` hoy no tiene constraint único (`sessionId String? @map("session_id")`, sin `@unique`). Para que `save`/`complete` puedan resolver de forma segura "¿ya existe un Contact para este sessionId?" sin condición de carrera (dos steps guardados casi simultáneo), se necesita un índice único `@@unique([workspaceId, sessionId])` en el modelo `Contact` (con migración de Prisma). Sin esto, "upsert por sessionId" no es un upsert real.

- **Idempotencia en `complete` — obligatorio, no opcional**: en `sheets.service.ts`, `emitMetaFinanceApplicationSubmittedEvent` se dispara con la condición `isComplete && rowConsentGranted && rowIsFinancingApplication`, **sin** estar gateada por `isNewContact` — en el cron eso es seguro porque `importedSessionIds` impide reprocesar la misma fila dos veces. El endpoint directo no tiene ese mecanismo, y un retry de red desde `completeLead()` en solar (o un doble-click del usuario mientras el request está en vuelo) dispararía el evento de financiamiento — y potencialmente `Contact`/`Lead` — dos veces hacia Meta. Antes de reusar esta lógica hay que agregar un guard explícito (ej. un campo `financeEventSentAt`/`capiEventsSentAt` en `qualificationData` o columna dedicada) que impida reenviar el mismo evento para el mismo `Contact` en una segunda llamada a `complete`. Esto reproduciría exactamente el tipo de bug de duplicación que ya se corrigió una vez en este proyecto (dedup de `event_id` entre solar y Metria) — no se puede dejar pasar de nuevo por el camino nuevo.
- **`Backend/src/modules/leads/solarQualifier.ts`** (nuevo): reglas determinísticas de calificación específicas para el shape de `StepData` de solar (`montoBoleta`, `propertyType`, `ownershipType`, `techoConfirmado`, `plazoInstalacion` → `CALIFICA`/`REVISAR`/`NO_CALIFICA`), sin pasar por el agente de IA genérico de `sheets.agent.ts` (ese existe para inferir mapeos de columnas arbitrarias; acá el shape ya es conocido y tipado).
- **`Backend/src/modules/leads/solarLead.routes.ts`** (nuevo): `POST /api/public/solar/lead`, `GET /api/public/solar/lead`. Validación de payload con `zod`. Registrado en `Backend/src/app.ts`.
- **`authenticateSolarApiKey`** middleware (nuevo, en `Backend/src/middleware/`): compara header `X-Solar-Api-Key` contra `process.env.SOLAR_API_KEY`. Sin JWT/login de usuario — es tráfico público de internet, no de un usuario autenticado de Metria.
- **Rate limiting** en estas dos rutas (`express-rate-limit` o el que ya use el proyecto para webhooks públicos) — es un endpoint público sin auth de usuario, necesita protección contra abuso.
- **Env vars nuevas en Backend**: `SOLAR_API_KEY`, `SOLAR_WORKSPACE_ID`, `SOLAR_PIPELINE_ID`, `SOLAR_STAGE_ID` (single-tenant, hardcode vía config en vez de UI de `SheetIntegration`).

### solar (repo aparte)

- **`src/app/actions.ts`**: `WEBHOOK_URL` (`GS_WEBHOOK_URL`) se reemplaza por `METRIA_API_URL` + `METRIA_SOLAR_API_KEY`. Las firmas de `saveProgress`, `getLeadProgress`, `completeLead`, `getQuoteDataBySessionId`, `resetSession` no cambian — cero cambios en componentes de UI (`Contacto`, `Resultado`, pasos del wizard).
- El gate de consentimiento client-side en `completeLead()` (422 si `consentAccepted !== true`) se mantiene tal cual — ya está correcto.
- `test-gs.js` y la dependencia de `GS_WEBHOOK_URL` se eliminan después del corte.

## Flujo de datos

- **`save`** (cada paso del wizard, llamado repetidamente sobre el mismo `sessionId`): busca `Contact` por `(workspaceId, sessionId)`; si no existe, lo crea con tag `Incompleto`; si existe, mergea los campos nuevos de este paso en `qualificationData.rawFields` (sin pisar campos ya guardados con valores vacíos). Sin disparo de CAPI en ningún caso.
- **`complete`**: gate de consentimiento server-side (422 si `consentAccepted !== true` — defensa en profundidad, no confiar solo en el chequeo del cliente). Antes de tocar `Contact` por email/phone, resuelve primero por `sessionId` (el Contact parcial creado por `save`, si existe) y **luego** revisa si el email/phone final ya pertenece a otro Contact distinto — si es así, es un tercer caso de conflicto (Contact-por-sessionId vs Contact-por-email/phone) que no puede resolverse en silencio; se registra como error para resolución manual, igual que el caso existente `contactByEmail.id !== contactByPhone.id` en `sheets.service.ts`. Si no hay conflicto: quita tag `Incompleto`, corre `solarQualifier`, crea `Deal` si no existe, y dispara `emitMetaContactEvent`/`emitMetaLeadEvent`/`FinanceApplicationSubmittedEvent` **solo si este Contact no los tiene ya marcados como enviados** (ver guard de idempotencia arriba) — mismo esquema de `event_id` por `Contact.id` que ya evita duplicados hoy, más el guard nuevo contra `complete` llamado dos veces sobre el mismo lead. Handoff a WhatsApp si `linkToWhatsapp` está activo para el workspace.
- **`get`** (`GET /api/public/solar/lead?sessionId=`): devuelve el último snapshot guardado — usado para resume del wizard (`getLeadProgress`) y para regenerar el PDF en `/cotizaciones` (`getQuoteDataBySessionId`).

## Manejo de errores

- `save`/`get` en solar: fail-soft como hoy (try/catch + `console.error`, no bloquea al usuario si la red falla).
- `complete` en solar: falla dura y visible (`{ok:false,status}`) — es el momento de submit, el usuario debe enterarse si no se guardó.
- Backend: valida el payload con `zod` en el borde; nunca confía en `consentAccepted` del cliente sin re-chequear; errores de fila individuales quedan en logs estructurados (no hay concepto de "fila" acá, es un solo lead por request, así que un error simplemente responde 500 y el catch de solar lo loggea).

## Visibilidad de datos en Metria (reemplazo de la planilla como panel humano)

La planilla cumplía dos roles además de pivote técnico: registro humano-legible de cada lead y fuente de atribución para Meta Ads. Ambos necesitan casa en el perfil de `Contact` (`metria-metrics/Frontend/src/app/dashboard/crm/contacts/[contactId]/ContactProfileClient.tsx`), que ya tiene los campos en el modelo (`utm*`, `meta*Id`, `fbclid/fbc/fbp`, `consentVersion/At/Status`, `sessionId`) pero hoy quedan enterrados en `qualificationData.rawFields` (JSON opaco) o sin renderizar.

Secciones nuevas propuestas en el perfil de Contact (mismo patrón bento/glassmorphism del resto de la página):

1. **Propiedad y techo** — `propertyType`, `ownershipType`, `techoConfirmado`, `materialTecho`, comuna/dirección.
2. **Consumo eléctrico** — `montoBoleta`, `distribuidora`, `consumoHorario`, `empalme`, `plazoInstalacion`.
3. **Ubicación** — house/meter lat-lng + link a `houseMapUrl`/`meterMapUrl`.
4. **Solicitud de financiamiento** — card condicional (solo si el lead llenó ese paso): `edad`, `estadoCivil`, `valorCasa`, `deudaCasa`, `ingresoMensual`, `profesion`, `deudaContribuciones`, `embargoVigente`. Badge visible porque dispara `FinanceApplicationSubmitted`, señal de mayor intención.
5. **Cotización** — botón "Ver cotización" que linkea a `solar.drillchile.cl/cotizaciones?session=<sessionId>`. El PDF lo sigue generando solar bajo demanda; Metria no lo duplica ni lo almacena.
6. **Atribución / Meta Ads** — mejora del card "Fuente" existente: agrega `metaCampaignId`/`metaAdsetId`/`metaAdId` con link a Ads Manager, `utm*`, `landingUrl`, `referrer`, `fbclid`.
7. **Consentimiento** — `consentVersion`/`consentAt`/`consentStatus` como badge de auditoría.
8. **Progreso del wizard** — paso alcanzado + tag `Incompleto`/`Completo`, en tiempo real.

### Mejoras de eficiencia con Meta Ads habilitadas por este cambio

- **EMQ / frescura del evento**: CAPI pasa de disparar cada 5 min (cron) a instantáneo al completar — mejora el Event Match Quality y acorta el learning phase de campañas optimizando a `Lead`/`QualifiedLead`.
- **Funnel de abandono por paso**: cada `save` es ahora un evento individual en tiempo real (antes solo se veían filas finales en la planilla) — permite reportar en qué paso del wizard se cae la gente, retroalimentando creatividad/targeting.
- **`FinanceApplicationSubmitted` como señal de alta intención**: el evento ya existe (commits previos); con datos visibles en tiempo real en el Contact, se puede armar un ad set optimizando específicamente a esa conversión.
- **Reporte lead-quality × campaña** (mejora futura, fuera de este alcance): con `metaCampaignId` visible por Contact y `leadTemperature`/`qualificationStatus` ya calculados, se podría agregar (mismo patrón que `DailyMetric` para ROAS) un "% CALIFICA por campaña".
- El fix de deduplicación ya hecho (solar no dispara CAPI, un solo emisor con `event_id` por `Contact.id`) se preserva sin cambios — este rediseño solo lo hace más rápido.

## Testing

- **Backend**: tests unitarios de `leadIngestion.service.ts` (dedupe por email/phone con conflicto, gate de consentimiento, condiciones de disparo de cada evento CAPI) y de `solarQualifier.ts` (cada combinación relevante → `CALIFICA`/`REVISAR`/`NO_CALIFICA`). Tests de integración de las rutas nuevas: `save` crea/actualiza Contact con tag `Incompleto`; `complete` sin consentimiento → 422; `complete` con consentimiento → dispara eventos y quita el tag; request sin `X-Solar-Api-Key` → 401. Mismo patrón que `sheets.service.test.ts` / `sheets.routes.test.ts` ya existentes.
- **solar**: no tiene test runner hoy (sin `test` script en `package.json`). Agregar tests de `actions.ts` (mock de `fetch`) queda fuera de alcance salvo pedido explícito.

## Corte y limpieza

1. Desplegar Backend con el endpoint nuevo (feature-flag no necesario dado el bajo riesgo y single-tenant).
2. Desplegar solar apuntando a `METRIA_API_URL`/`METRIA_SOLAR_API_KEY` en vez de `GS_WEBHOOK_URL`.
3. **Ventana de verificación**: dejar el `SheetIntegration` de DrillChile activo (`isActive: true`, sigue sincronizando cada 5 min) en paralelo al endpoint nuevo durante unos días, y comparar manualmente que los `Contact`/`Deal`/eventos CAPI generados por ambos caminos coincidan para los mismos leads reales. DrillChile es el único cliente pagante hoy — un bug silencioso sin la planilla como red de respaldo pierde leads reales, así que no se apaga el camino viejo hasta confirmar paridad.
4. Recién entonces desactivar (`isActive: false`) el `SheetIntegration` — no se borra, queda como histórico/auditoría, los `Contact` ya importados no se tocan.
5. Eliminar de solar: `GS_WEBHOOK_URL`, `test-gs.js`.
6. El cron de Sheets (`sheets.cron.ts`) y el importador genérico se mantienen intactos para futuros clientes que sí usen planillas.

## Riesgos aceptados

- **Deriva de tipos entre repos**: sin paquete de tipos compartido (decisión: repos separados, sin monorepo), el schema `zod` del Backend y el `StepData` de solar se mantienen sincronizados a mano. Un cambio de campo en solar sin el cambio espejo en Backend falla silenciosamente en `save` (fail-soft) o con 400 en `complete`. Aceptado por ahora; si el wizard de solar empieza a cambiar seguido, vale la pena reconsiderar.
- **`sessionId` como bearer implícito**: el botón "Ver cotización" en el Contact profile linkea a una página pública de solar sin autenticación, protegida solo porque el `sessionId` no es adivinable. Ya es así hoy con la planilla (no es una regresión de este cambio), pero queda como limitación conocida, no resuelta por este trabajo.

## Fuera de alcance

- Multi-tenancy genérico para futuros "quote wizards" tipo solar (se revisita si aparece un segundo cliente con el mismo patrón).
- Monorepo o Prisma client compartido entre los dos repos.
- Almacenar o regenerar el PDF de cotización desde Metria (sigue siendo responsabilidad de solar).
- Reporte agregado "lead-quality × campaña" (mencionado como mejora futura, no parte de este trabajo).
