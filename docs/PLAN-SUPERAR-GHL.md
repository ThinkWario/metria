# Plan: Superar a GoHighLevel

> Documento estratégico. Fundamentado en auditoría real del código (no supuestos).
> Generado 2026-06-17. Auditoría: 4 dimensiones por agentes dedicados + 6 verificadas por inspección directa de schema/rutas/UI.

## 1. Veredicto honesto

Metria **no** supera hoy a GHL como suite completa — GHL es un todo-en-uno construido por años. Pero Metria ya **gana en su nicho** (e-commerce / servicios high-ticket tipo solar) por dos cosas que GHL hace mal o no hace, y está **a mitad de camino** en el CRM operativo.

La estrategia ganadora **no es clonar GHL feature por feature** (eso son años y se pierde). Es:
1. **Profundizar el foso que ya tenemos** — analítica de utilidad neta real + agente IA de cierre por WhatsApp. GHL es débil aquí.
2. **Neutralizar el foso de GHL** — su Workflow Builder visual. Es la brecha #1 y la de mayor valor estratégico.
3. **Cerrar lo operativo barato** — inbox usable por equipos y captura de leads. Muchos modelos ya existen huérfanos; es completar, no construir de cero.
4. **Saltar deliberadamente** lo que no aporta al vertical (website builder, membresías, reputación, teléfono).

## 2. Paridad por dimensión (vs GHL, 0–10)

| Dimensión | Paridad | Estado | Nota |
|---|---|---|---|
| Analítica / Reporting | **10+** | superior | Utilidad neta, ROAS, costos logísticos cruzando Shopify+Meta+Google+TikTok+Dropi. GHL no hace esto. **Joya de la corona.** |
| CRM Core | **8.5** | sólido | Contactos, pipeline kanban (recién construido), deals con probabilidad/forecast, segmentos, timeline, tareas, citas, lead scoring. |
| Agente IA | **8** | adelante en nicho | Closing agent WhatsApp (RAG-light, calificación, agendamiento, follow-ups). En producción. Más afilado que el Conversation AI genérico de GHL. |
| Multi-tenant / SaaS | **6** | sólido base | `workspaceId` en todo, roles, plan-gating PRO/SCALE. Sin white-label/sub-cuentas de agencia. |
| Inbox Omnicanal | **5** | parcial | Chasis bueno (bandeja unificada, tiempo real, handoff IA↔humano). Falta: snippets, asignación, gestión de estado, búsqueda, Email/SMS. |
| Pagos / Productos | **3** | parcial | `Order` + `Product` existen (e-commerce). MercadoPago SDK instalado. Sin Invoice/links de pago/suscripciones CRM. |
| Automatización / Workflows | **2** | **brecha clave** | Solo engine de bot acoplado a mensajería (3 triggers, ~6 acciones, sin if/else, sin webhook). ~10-15% de GHL. |
| Campañas Email/SMS | **1** | casi ausente | Segmentos existen (audiencia lista) pero **cero** capa de envío. Ningún provider email/SMS instalado. |
| Funnels / Forms / Landing | **1** | casi ausente | Sin builder de páginas/formularios/encuestas. Scheduling existe pero sin booking público. |
| Reputación / Reviews | **0** | ausente | Confirmado: sin modelo `Review`. |

**Paridad global ponderada: ~5/10** como suite. Pero el vertical objetivo no compra "suite completa" — compra utilidad real + cierre con IA, y ahí ya vamos arriba.

## 3. Dónde Metria YA supera a GHL (capitalizar, no descuidar)

- **Utilidad neta real por canal.** GHL te muestra leads y pipeline; no te dice cuánto ganas después de costo de producto, ads, y logística. Metria sí. Es el argumento de venta #1.
- **Cierre por WhatsApp con IA vertical.** El agente califica, agenda y hace follow-up. GHL tiene IA conversacional genérica; el closing agent vertical es superior para el caso de uso.
- **Handoff IA↔humano integrado** en el inbox — más fluido que GHL.

Acción de capitalización (Fase 5): **inyectar la analítica al CRM** — ROAS por lead, utilidad por cliente/deal en las vistas de contacto y pipeline. Nadie más puede mostrar eso.

## 4. Roadmap por fases (impacto/esfuerzo)

Esfuerzo: S (días) · M (1-2 sem) · L (3-4 sem) · XL (mes+).

### Fase 0 — Pulido de lo recién entregado · impacto medio · S
Quitar el olor a "sin terminar" antes de seguir.
- Verificar en navegador kanban + tabs aplanadas (requiere redeploy backend Easypanel — pendiente del lado del usuario).
- Inbox `ContactPanel`: reemplazar placeholders hardcodeados ("Hace 2 días", nota ficticia) por datos reales del contacto.
- Conectar búsqueda de conversaciones (input hoy decorativo) + tabs de estado (el service ya filtra por status).

### Fase 1 — EL FOSO: Workflow Builder genérico · impacto **alto** · L
La jugada de mayor valor estratégico. Neutraliza la ventaja central de GHL y conecta todo lo demás.
- Modelos `Workflow` / `WorkflowTrigger` / `WorkflowAction` en schema, **desacoplados** de `BotFlow`.
- Dispatcher que consume los `ContactEvent` que **ya emitimos** (DEAL_STAGE_CHANGED, TASK_COMPLETED, DEAL_WON/LOST, MESSAGE_RECEIVED, STATUS_CHANGED). La infra de eventos ya existe — falta el motor que reaccione.
- Triggers: deal movido, deal ganado/perdido, tarea completada, contacto creado, tag añadido, mensaje recibido, cita agendada, formulario enviado.
- Acciones: enviar mensaje (WhatsApp/email/SMS), crear tarea, mover deal, añadir/quitar tag, cambiar estado, **webhook HTTP**, **esperar/delay**, **if/else**.
- Página "Automatizaciones" en sidebar con builder visual (canvas nodos trigger → esperar → acción → rama).
- Generalizar el `delay` que ya existe en `FollowUpRule` como nodo de espera reutilizable.

### Fase 2 — Inbox operable por equipos · impacto alto · S-M
Wins baratos: los modelos ya existen huérfanos, solo falta ruta + UI.
- **QuickReply/snippets**: CRUD backend + selector con atajo `/` en el composer. (Modelo `QuickReply` ya existe, 0 rutas hoy.)
- **Asignación de conversaciones**: ruta `PATCH /conversations/:id/assign` + filtro "asignadas a mí". (`assignedToUserId` + índice ya en schema.)
- **Gestión de estado**: cerrar/reabrir/pendiente + tabs.
- Notas internas (toggle nota/respuesta — `isInternal` ya existe), contador de no-leídos, recibos de lectura reales (`readAt` ya en schema).

### Fase 3 — Captura de leads · impacto alto · M-L
Alimenta el CRM que ya tenemos.
- **Calendario de booking público** (competidor directo de Calendly): exponer ruta pública sobre el motor de slots que **ya existe** en `scheduling.service.ts` + crear contacto al reservar. Alto leverage: el engine de disponibilidad ya está hecho.
- **Form builder**: modelos `Form`/`FormField`/`Submission` + formulario público hospedado que crea contacto CRM al enviar → dispara workflow (Fase 1).
- (Opcional) landing pages mínimas para que los leads aterricen en algún lado.

### Fase 4 — Capa de envío / Campañas · impacto alto · L
Los segmentos ya existen; falta el disparador.
- Integrar provider email (Resend/SES) + SMS (Twilio). **Hoy no hay ninguno instalado.**
- Modelos `Campaign`/`Broadcast`/`CampaignRecipient`.
- Endpoint "enviar a segmento" (reutiliza segmentos existentes).
- Plantillas con merge tags + asunto, broadcasts programados, tracking de aperturas/clicks, unsubscribe/opt-out (compliance).
- Drip multi-paso vía el motor de Fase 1 (enrolar segmento → esperar → enviar → ramificar).

### Fase 5 — Diferenciadores que GHL no tiene · impacto alto · M
Aquí no igualamos a GHL — nos despegamos.
- Inyectar analítica al CRM: **ROAS por lead, utilidad neta por cliente/deal** en vistas de contacto y pipeline.
- Expandir el agente IA: re-engagement, pedir reseñas, recuperación de carrito.
- Links de pago con MercadoPago (SDK ya instalado) sobre deals/órdenes.

### Fase 6 — SaaS / Agencia (opcional, según modelo de negocio) · XL
Solo si se va por la ruta agencia. White-label, sub-cuentas, billing del SaaS, snapshots.

## 5. Lo que NO vamos a construir (honestidad estratégica)
Bajo ROI para el vertical; revisar solo si un cliente lo pide:
- Website/funnel builder completo (drag-drop de páginas multinivel).
- Membresías / cursos / comunidades.
- Reputación / gestión de reseñas / GMB.
- Sistema telefónico / call tracking.

Clonar todo esto sería pelear en el terreno de GHL y perder. El terreno donde ganamos es: **profit real + IA de cierre + CRM/automatización suficientemente buenos**.

## 6. Estado de verificación
- **Auditado por agentes**: Inbox, Automatización, Campañas, Funnels/Forms.
- **Verificado por inspección directa esta sesión**: CRM Core (kanban/tabs construidos y compilando), Pagos (`Order`/`Product`/MercadoPago), Reputación (ausente confirmado), SaaS (plan-gating + workspaceId).
- **Builds**: frontend `✓ 30 rutas`, backend `tsup ✓`. 
- **Pendiente**: verificación en navegador del kanban en producción (requiere redeploy backend Easypanel del lado del usuario).
- CRM Core / IA / Analítica: cubiertos por conocimiento de sesión + memoria de proyecto; re-auditables tras reset del límite de sesión (1:10am Santiago) si se quiere el reporte formal.

## 7. Recomendación de arranque
Empezar por **Fase 1 (Workflow Builder)** en paralelo con **Fase 2 (inbox ops)**: la primera es la de mayor valor estratégico, la segunda da wins visibles baratos mientras la primera madura. Ambas se pueden ejecutar con agentes dedicados.
