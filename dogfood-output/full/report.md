# Dogfood Report: Metria Metrics

| Field | Value |
|-------|-------|
| **Date** | 2026-06-13 |
| **App URL** | https://metria-metrics.vercel.app |
| **Session** | metria-audit-v2 |
| **Scope** | Auditoría completa: todas las secciones, funcionalidad, visual, messaging, AI Agent |
| **Credentials** | admin@metria.com / metria2025 |

## Summary

| Severity | Count |
|----------|-------|
| Critical | 1 |
| High | 3 |
| Medium | 4 |
| Low | 5 |
| **Total** | **13** |

---

## Issues

### ISSUE-001 · CRITICAL · Auth · Token perdido → usuario atrapado sin logout

**Descripción:** Si el `metria_token` en localStorage se borra (limpieza de browser, sesión expirada, headless browser), el usuario queda atrapado: la cookie httpOnly `metria_session` sigue activa y `/login` redirige a `/dashboard`, pero todas las llamadas API devuelven 401. No hay mecanismo automático de recuperación.

**Pasos para reproducir:**
1. Iniciar sesión normalmente
2. Borrar manualmente `metria_token` de `localStorage`
3. Navegar a cualquier página del dashboard
4. Todas las cards muestran error pero no hay redirect a login

**Impacto:** Usuario puede quedar permanentemente atrapado sin poder re-autenticarse.

**Fix aplicado:** `fetchAPI` ahora detecta 401, limpia `localStorage.metria_token` y redirige a `/api/auth/logout` para borrar la cookie httpOnly.

**Screenshot:** `screenshots/issue-001-user-lost.png`

---

### ISSUE-002 · HIGH · Inbox · Envío falla silenciosamente cuando sesión WhatsApp inactiva

**Descripción:** Cuando la sesión de whatsapp-web.js se desconecta (por reinicio del backend), el botón "Enviar" en Inbox no muestra ningún feedback. El texto permanece en el input y el error `Error: WhatsApp session not active` solo aparece en consola del desarrollador.

**Pasos para reproducir:**
1. Reiniciar el backend
2. Abrir Inbox → seleccionar conversación
3. Escribir texto y presionar Enter o botón Send
4. El texto no se envía, no aparece toast de error

**Impacto:** Agentes de soporte no saben si su mensaje fue enviado o no.

**Fix aplicado:** `ChatWindow.tsx` — el bloque `catch` vacío ahora llama `toast.error(err?.message || 'No se pudo enviar el mensaje')`.

---

### ISSUE-003 · HIGH · CRM · Botón "Nuevo Contacto" no hace nada

**Descripción:** El botón "Nuevo Contacto" en `/dashboard/crm` no tiene `onClick` handler. No abre ningún modal, formulario o navegación.

**Pasos para reproducir:**
1. Navegar a CRM
2. Hacer clic en "Nuevo Contacto"
3. Nada ocurre

**Impacto:** No es posible crear contactos manualmente desde la UI.

**Fix aplicado:**
- Backend: `POST /crm/contacts` route + `createContact` service + `createContactHandler`
- Frontend: Dialog con formulario (nombre, teléfono, email, estado) conectado al endpoint

---

### ISSUE-004 · HIGH · CRM Pipelines · Página muestra skeleton eterno (HTTP undefined)

**Descripción:** `/dashboard/crm/pipelines` nunca carga datos. La consola muestra `Error: HTTP undefined`. El bug: `PipelinesClient` llama `fetchAPI(...).then(r => { if (!r.ok) throw... })` pero `fetchAPI` ya retorna JSON parseado (no una `Response`), por lo que `r.ok` es `undefined` y siempre lanza.

**Mismo bug en:** `/dashboard/crm/tickets` con `TicketsClient`.

**Fix aplicado:** Eliminados los `.then(r => { if (!r.ok) throw...; return r.json() })` intermediarios en `PipelinesClient.tsx` y `TicketsClient.tsx`. También corregido el `handleMove` y `handleResolve` que hacían lo mismo.

---

### ISSUE-005 · MEDIUM · Contactos · 19/20 muestran `@lid` / `@newsletter` en el teléfono

**Descripción:** Los contactos existentes tienen el campo `phone` con sufijos internos de WhatsApp: `141652333191328@lid`, `120363169328266116@newsletter`. Esto ocurre porque los datos fueron importados antes del fix `split('@')[0]` aplicado en sesión anterior.

**Impacto:** Visual — los teléfonos se muestran como IDs ilegibles en la tabla de contactos y en chats.

**Fix pendiente:** Script de migración DB para limpiar `contact.phone` en el workspace demo.

```sql
UPDATE "Contact"
SET phone = split_part(phone, '@', 1)
WHERE phone LIKE '%@%';
```

---

### ISSUE-006 · MEDIUM · Mensajes duplicados en Inbox (handover_to_human)

**Descripción:** Cuando el AI Agent llama `handover_to_human`, aparece dos veces el mensaje de sistema "Derivó la conversación a un agente humano": una vez como mensaje interno de `logAiAction` y otra como respuesta de texto del AI después del tool call.

**Fix aplicado:** `processAiResponse` en `ai.service.ts` ahora rastrea si `handover_to_human` fue llamado y retorna `null` (suprimiendo el texto) en ese caso.

---

### ISSUE-007 · MEDIUM · Múltiples páginas sin `<title>` correcto

**Descripción:** Las siguientes páginas mostraban el título genérico "Metria Metrics | Software de Rentabilidad y Utilidad Neta en E-Commerce" en lugar de un título específico:
- Canales de Mensajería
- Configuración IA
- Finanzas E-commerce
- Logística & Operaciones
- Marketing & Ads
- Canales de Venta
- Configuración Técnica
- Google Ads
- TikTok Ads

**Causa:** Todas estas `page.tsx` tenían `'use client'` lo que impide exportar `metadata`.

**Fix aplicado:** Refactorizadas todas a patrón server wrapper (`page.tsx` exporta `metadata` + renderiza `PageClient.tsx`).

---

### ISSUE-008 · MEDIUM · Canales · Estado WhatsApp muestra "Desconectado" aunque esté conectado

**Descripción:** La página Canales consulta `/messaging/channels` y normaliza el status a lowercase. Cuando WhatsApp está conectado vía QR, el backend guarda `status: 'CONNECTED'` en la DB, pero el canal puede estar "conectado" en la DB mientras el proceso Puppeteer está caído (post-restart). La UI muestra el estado de la DB, no el del proceso real.

**Impacto:** El usuario ve "Conectado" pero no puede enviar mensajes.

**Fix pendiente:** Endpoint `/messaging/channels` debería cruzar `db.status` con `WhatsAppSessionManager.clients.has(workspaceId)` para retornar estado real.

---

### ISSUE-009 · LOW · Inbox · Botones de cabecera sin `aria-label`

**Descripción:** Los 4 botones de icono en el header del chat (Llamar, Videollamada, Buscar, Más opciones) no tienen `aria-label`. Los screen readers no pueden identificarlos.

**Fix aplicado:** Agregado `aria-label` a los 4 botones en `ChatWindow.tsx`.

---

### ISSUE-010 · LOW · Citas · Estado vacío sin CTA accionable

**Descripción:** Cuando no hay citas, la pantalla muestra texto pero no hay botón para agendar una. El estado vacío no guía al usuario hacia la acción.

**Fix aplicado:** Agregado botón "Agendar por WhatsApp" en el estado vacío de `AppointmentsClient.tsx`.

---

### ISSUE-011 · LOW · Contactos · Nombres genéricos ("WhatsApp User")

**Descripción:** 3 de 20 contactos muestran "WhatsApp User" como nombre. Esto ocurre cuando `notifyName` no está disponible en el primer sync de chats y se usa el fallback.

**Fix pendiente:** En `syncChats`, si el nombre es el fallback genérico, intentar resolverlo en mensajes posteriores.

---

### ISSUE-012 · LOW · CRM Pipelines · Sin botón "Crear Pipeline" en la UI

**Descripción:** La página de Pipelines no tiene botón para crear un nuevo pipeline. Solo existe el endpoint `POST /crm/pipelines` en el backend. La UI solo muestra el selector de pipelines existentes.

**Fix pendiente:** Agregar botón "Nuevo Pipeline" con dialog de creación.

---

### ISSUE-013 · LOW · Configuración Técnica · Botones de acción sin `aria-label`

**Descripción:** En la sección "Configuración Técnica" algunos botones de acción (ej. toggle switches y botones de sync) no tienen texto visible ni `aria-label`.

**Fix pendiente:** Revisar y agregar `aria-label` descriptivos a los controles sin etiqueta.

---

## Secciones Verificadas

| Sección | Estado | Notas |
|---------|--------|-------|
| Landing / Login | ✅ OK | Credenciales demo visibles, login funciona |
| Dashboard Principal | ✅ OK | KPIs, gráficos, fecha range |
| Inbox (Chats) | ⚠️ Parcial | Carga 20 chats, mensajes visibles, send falla silenciosamente |
| CRM Contactos | ⚠️ Parcial | Lista carga, Nuevo Contacto no funcionaba (fix aplicado) |
| CRM Pipelines | ❌ Roto | HTTP undefined (fix aplicado) |
| CRM Tickets | ❌ Roto | HTTP undefined (fix aplicado) |
| Citas | ⚠️ Parcial | Carga vacío, sin CTA (fix aplicado) |
| Configuración IA | ✅ OK | Formulario funcional, guarda cambios |
| Canales | ⚠️ Parcial | QR funciona, estado puede no reflejar realidad |
| Finanzas E-commerce | ✅ OK | Datos de demo, gráficos renderizan |
| Canales de Venta | ✅ OK | Vista funcional |
| Marketing & Ads | ✅ OK | Meta/Google/TikTok tabs |
| Google Ads | ✅ OK | Métricas de demo |
| TikTok Ads | ✅ OK | Métricas de demo |
| Logística | ✅ OK | Tabla de envíos demo |
| Configuración Técnica | ⚠️ Parcial | Botones sin aria-label |
| Bots | ✅ OK | Lista "Asistente Metria" correctamente |

---

## Fixes Aplicados en Esta Sesión

| # | Archivo(s) | Descripción |
|---|-----------|-------------|
| 1 | `src/lib/api.ts` | 401 → logout automático (limpia cookie + localStorage) |
| 2 | `inbox/components/ChatWindow.tsx` | Toast de error en send fallido |
| 3 | `crm/CrmContactsClient.tsx` | Dialog "Nuevo Contacto" con formulario |
| 4 | `Backend/crm/contact.service.ts` | `createContact()` function |
| 5 | `Backend/crm/crm.controller.ts` | `createContactHandler` |
| 6 | `Backend/crm/crm.routes.ts` | `POST /crm/contacts` route |
| 7 | `crm/pipelines/PipelinesClient.tsx` | Fix fetchAPI pattern (HTTP undefined) |
| 8 | `crm/tickets/TicketsClient.tsx` | Fix fetchAPI pattern (HTTP undefined) |
| 9 | `Backend/ai-agent/ai.service.ts` | Suprimir texto AI post-handover (dedup msg) |
| 10 | `inbox/components/ChatWindow.tsx` | `aria-label` en botones de cabecera |
| 11 | `crm/appointments/AppointmentsClient.tsx` | CTA en estado vacío |
| 12 | 9 `page.tsx` files | `metadata` export en todas las páginas |
| 13 | Backend (sesión anterior) | Fix 401 al enviar: `isNative` → WhatsAppSessionManager |
| 14 | Backend (sesión anterior) | Fix AI contactId hallucination |
| 15 | Backend (sesión anterior) | Fix Puppeteer `protocolTimeout: 120000` |

---

## Pendientes (No Corregidos)

| # | Prioridad | Descripción |
|---|-----------|-------------|
| 1 | MEDIUM | ISSUE-005: DB migration para limpiar `contact.phone` @lid/@newsletter |
| 2 | MEDIUM | ISSUE-008: Canales — cruzar estado DB con estado real del proceso WA |
| 3 | LOW | ISSUE-011: Nombres genéricos "WhatsApp User" en sync inicial |
| 4 | LOW | ISSUE-012: Botón "Crear Pipeline" en UI de Pipelines |
| 5 | LOW | ISSUE-013: aria-label en Configuración Técnica |
