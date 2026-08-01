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

- **`Backend/src/modules/leads/leadIngestion.service.ts`** (nuevo): extrae de `sheets.service.ts` la lógica por-lead que hoy vive dentro del loop `for (const row of rows)` — dedupe por email/phone, gate de consentimiento, creación/actualización de `Contact`, creación de `Deal`, disparo de eventos CAPI, handoff de WhatsApp — como funciones puras reusables que reciben un objeto de datos ya resuelto (no una fila de spreadsheet). `sheets.service.ts` se refactoriza para llamar estas mismas funciones, de modo que el importador genérico de Sheets (usado por futuros clientes que sí necesiten mapeo de columnas) no se duplica ni diverge.
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

- **`save`** (cada paso del wizard): upsert de `Contact` por `sessionId` (no por email/phone — aún no existen en pasos tempranos), tag `Incompleto`, sin disparo de CAPI.
- **`complete`**: gate de consentimiento server-side (422 si `consentAccepted !== true` — defensa en profundidad, no confiar solo en el chequeo del cliente), quita tag `Incompleto`, corre `solarQualifier`, crea `Deal` si no existe, dispara `emitMetaContactEvent`/`emitMetaLeadEvent`/`FinanceApplicationSubmittedEvent` (mismo esquema de `event_id` por `Contact.id` que ya evita duplicados hoy), handoff a WhatsApp si `linkToWhatsapp` está activo para el workspace.
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
3. Desactivar (`isActive: false`) el `SheetIntegration` de DrillChile en vez de borrarlo — queda como histórico/auditoría, los `Contact` ya importados no se tocan.
4. Eliminar de solar: `GS_WEBHOOK_URL`, `test-gs.js`.
5. El cron de Sheets (`sheets.cron.ts`) y el importador genérico se mantienen intactos para futuros clientes que sí usen planillas.

## Fuera de alcance

- Multi-tenancy genérico para futuros "quote wizards" tipo solar (se revisita si aparece un segundo cliente con el mismo patrón).
- Monorepo o Prisma client compartido entre los dos repos.
- Almacenar o regenerar el PDF de cotización desde Metria (sigue siendo responsabilidad de solar).
- Reporte agregado "lead-quality × campaña" (mencionado como mejora futura, no parte de este trabajo).
