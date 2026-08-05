# Sección dedicada de plantillas de WhatsApp + binding de variables

Fecha: 2026-08-05
Workspace: aplica a cualquier workspace con canal WhatsApp Cloud API conectado

## Objetivo

Resolver dos problemas detectados en `WhatsAppTemplatesPanel.tsx` (panel de plantillas
dentro de Configuración Técnica → Canales de Mensajería):

1. **Espacio insuficiente**: el panel vive en una card angosta dentro de la página de
   canales. El texto de cada plantilla se corta con `truncate` (una línea) y no hay
   forma de ver el contenido completo.
2. **Variables de plantilla sin control real**: al crear una plantilla con `{{n}}`, el
   backend arma un `example.body_text` automático con placeholders genéricos
   (`Ejemplo1`, `Ejemplo2`...) para que Meta no rechace el envío a revisión
   (`whatsappTemplates.client.ts:46-53`), pero el usuario no ve ni controla ese ejemplo,
   y no existe ninguna relación entre los `{{n}}` de la plantilla y los datos reales que
   el sistema va a insertar al enviarla.

## Contexto / estado actual

- Tres "roles" de plantilla existen hoy, cada uno con su propio call site que arma el
  array de parámetros **hardcodeado**, en un orden fijo asumido:
  - `openingTemplateId` (saludo a leads nuevos) — `whatsappHandoff.ts:119-126`, manda
    `[contact.name]` → asume que la plantilla tiene exactamente `{{1}}`.
  - `technicalVisitTemplateId` (aviso interno de visita agendada) —
    `appointment-notifications.service.ts:75`, manda
    `[contact.name, contact.phone ?? 'sin teléfono', when]` → asume `{{1}} {{2}} {{3}}`
    en ese orden.
  - `visitConfirmationTemplateId` (pregunta de confirmación post-visita) —
    `visitConfirmation.cron.ts:32-38`, manda `[appt.contact.name]` más dos botones de
    respuesta rápida (`confirm_visit:*:yes/no`, fuera de alcance — no son variables de
    body) → asume `{{1}}`.
- Nada impide asignar (`setOpeningTemplateHandler`, `setTemplateRoleHandler` en
  `templates.controller.ts`) una plantilla con un número distinto de `{{n}}` a
  cualquiera de estos roles. El único chequeo hoy es `status === 'APPROVED'`. El
  mismatch solo se descubre en producción cuando Meta rechaza el envío (parámetros
  insuficientes) o, peor, cuando "sobra" un `{{n}}` sin reemplazar y el mensaje sale
  roto.
- La columna `WhatsAppTemplate.variables Json?` existe en el schema
  (`schema.prisma:398`) pero ningún código la puebla ni la lee — el campo `variables`
  que ya acepta `createTemplateHandler` en el body nunca se manda desde el frontend.
- `WhatsAppTemplatesPanel.tsx` solo tiene un campo de texto libre para el body, sin
  detectar cuántas `{{n}}` hay ni pedir nada sobre ellas.

## Diseño

### 1. Catálogo de variables (backend, fuente única)

Nuevo archivo `Backend/src/modules/messaging/templateVariables.ts`:

```ts
export const TEMPLATE_VARIABLE_CATALOG = [
  { key: 'contact.name',     label: 'Nombre del lead',        example: 'Juan Pérez' },
  { key: 'contact.phone',    label: 'Teléfono del lead',      example: '+56912345678' },
  { key: 'appointment.when', label: 'Fecha y hora de visita', example: 'martes 12 de agosto, 10:00' }
] as const

export const ROLE_VARIABLE_REQUIREMENTS: Record<string, string[]> = {
  openingTemplateId: ['contact.name'],
  technicalVisitTemplateId: ['contact.name', 'contact.phone', 'appointment.when'],
  visitConfirmationTemplateId: ['contact.name']
}
```

Estas listas reflejan exactamente lo que cada call site ya manda hoy (sección
"Contexto") — no cambian el comportamiento de envío, solo lo hacen explícito y
verificable.

Nuevo endpoint `GET /messaging/whatsapp/templates/variable-catalog` (mismo
`requirePlan('PRO', 'SCALE')` que el resto de rutas de templates) devuelve
`TEMPLATE_VARIABLE_CATALOG`. El frontend lo consume para poblar los `<Select>` — no
duplica la lista.

### 2. Creación de plantilla — variables mapeadas, no texto libre

`WhatsAppTemplatesPanel` (o su reemplazo en la página nueva, ver sección 4) detecta en
vivo, sobre el `bodyText` que el usuario escribe, todos los índices `{{1}}..{{n}}`
(mismo regex que ya usa el backend: `/\{\{(\d+)\}\}/g`). Por cada índice detectado,
renderiza un `<Select>` (opciones = catálogo del paso 1) para que el usuario elija a
qué variable real corresponde ese placeholder, en orden.

Al enviar el formulario, el `POST /messaging/whatsapp/templates` incluye
`variables: string[]` (las keys elegidas, en orden de índice).

`createTemplateHandler` (`templates.controller.ts`):
- Si el body trae `variables`, valida `variables.length === maxVar` (mismo cálculo de
  `maxVar` que ya hace `whatsappTemplates.client.ts`). Si no calzan, `400` con mensaje
  claro.
- Valida que cada key exista en `TEMPLATE_VARIABLE_CATALOG`. Si no, `400`.
- Pasa las keys a `createMetaTemplate` para que arme el `example.body_text` con los
  `example` reales del catálogo (`'Juan Pérez'`, no `'Ejemplo1'`) en vez del genérico
  actual.
- Guarda `variables` en la fila (`prisma.whatsAppTemplate.create`, ya acepta el campo,
  solo faltaba quien lo mandara).
- Si el body NO trae `variables` (compatibilidad con cualquier llamada externa antigua
  al mismo endpoint), se comporta exactamente igual que hoy: placeholders genéricos,
  `variables` queda `null` en la fila.

### 3. Vista completa de una plantilla (modal)

Cada fila de la lista de plantillas agrega un botón ícono "ver" (`Eye`, lucide-react)
que abre un `Dialog` (shadcn/ui, mismo patrón que `ProfileDialog`/`PreferencesDialog`
ya usados en el sidebar) mostrando: nombre, idioma, categoría, badge de estado,
`bodyText` completo sin truncar, y — si `variables` no es `null` — la lista de
variables mapeadas con su label del catálogo (ej. "`{{1}}` → Nombre del lead"). Sin
llamada a red adicional: la fila ya trae todos estos datos desde el `GET` de la lista.

Reemplaza el `<p className="truncate">` actual (`WhatsAppTemplatesPanel.tsx:244`) por
una versión que sigue truncando en la fila (vista rápida) pero el modal es la fuente de
verdad para el texto completo.

### 4. Página dedicada

Nueva ruta `metria-metrics/Frontend/src/app/dashboard/settings/channels/templates/page.tsx`
(Server Component con `Metadata`, patrón estándar del proyecto) que renderiza un
`TemplatesPageClient` full-width con el contenido actual de `WhatsAppTemplatesPanel`
(formulario de creación + lista), simplemente sin la restricción de ancho de card
angosta que tiene hoy dentro de `channels/page.tsx`.

`channels/page.tsx` reduce el bloque de WhatsApp templates a una card resumen chica
(cantidad de plantillas, cuántas `APPROVED`/`PENDING`/`REJECTED`) con un botón
"Gestionar plantillas →" que enlaza a `/dashboard/settings/channels/templates`.

No se toca `app-sidebar.tsx` ni `menuVisibility.ts` — la página nueva cuelga de la
misma sección "Canales de Mensajería" ya existente en el menú, solo un nivel más
adentro. Si en el futuro se quiere acceso directo desde el sidebar, es un cambio
aparte y de bajo costo (se linkea igual que cualquier `MenuItem`).

### 5. Asignación de rol — validar compatibilidad (el fix del bug de fondo)

`setOpeningTemplateHandler` y `setTemplateRoleHandler` (`templates.controller.ts`),
antes de guardar la asignación:

```ts
const required = ROLE_VARIABLE_REQUIREMENTS[role] // o el fijo de opening
if (template.variables !== null) {
  const templateVars = template.variables as string[]
  if (!arraysEqual(templateVars, required)) {
    res.status(400).json({
      error: `Esta plantilla usa variables [${templateVars.join(', ')}] pero este rol requiere [${required.join(', ')}]`
    })
    return
  }
}
// template.variables === null → plantilla legacy (creada antes de este cambio o vía
// API externa sin variables), se permite asignar sin validar — mismo comportamiento
// que existe hoy, no rompe nada ya asignado en producción.
```

Frontend: el toast de error de `handleSetOpening`/`handleSetTechnicalVisit`/
`handleSetVisitConfirmation` ya maneja cualquier `err.message` del backend
(`WhatsAppTemplatesPanel.tsx:124-126` etc.) — el mensaje nuevo se muestra tal cual, sin
cambios de UI adicionales en esta iteración. Los botones de asignación de rol no se
ocultan condicionalmente (evita falsos negativos si el usuario todavía no llenó
`variables` en una plantilla vieja) — la validación vive únicamente en el backend.

### 6. Envío de mensajes — sin cambios

`whatsappHandoff.ts`, `appointment-notifications.service.ts` y
`visitConfirmation.cron.ts` **no se modifican**. Siguen mandando los mismos arrays
hardcodeados de siempre. La validación del paso 5 ya garantiza, hacia adelante, que
solo se asignan a cada rol plantillas cuyas `variables` calzan con lo que ese rol
manda — así el hardcode existente se mantine correcto sin tocar rutas de envío ya en
producción. Migrar esos call sites a leer `template.variables` dinámicamente en vez de
un array fijo es una mejora futura fuera de alcance (tocaría código de envío real, con
más riesgo, para un beneficio marginal ahora que el mismatch queda bloqueado en el
punto de asignación).

## Riesgos conocidos (fuera de alcance de esta iteración)

- Plantillas creadas antes de este cambio (`variables = null`) no se pueden
  re-mapear retroactivamente desde la UI en esta iteración — quedan como "legacy",
  asignables sin validar (igual que hoy). Si se quiere forzar el mapeo, es una
  iteración aparte (ej. un botón "completar variables" sobre filas legacy).
- Los botones de confirmación de `visitConfirmationTemplateId`
  (`confirm_visit:*:yes/no`) no son parte de este diseño — siguen siendo un caso
  aparte, no modelado en el catálogo de variables (son quick-reply buttons, no `{{n}}`
  del body).
- No se agrega un preview en vivo del mensaje renderizado (con los `example` values
  sustituidos) — el modal del paso 3 muestra la plantilla con `{{n}}` literal más la
  lista de a qué variable mapea cada uno, no un render final.

## Validación end-to-end

- Crear plantilla con 2 `{{n}}` mapeadas a `contact.name` y `contact.phone` → Meta
  recibe `example.body_text` con `["Juan Pérez", "+56912345678"]`, fila queda con
  `variables: ["contact.name", "contact.phone"]`.
- Intentar asignar esa plantilla (2 variables) como `openingTemplateId` (que requiere
  solo 1) → `400`, no se asigna, toast muestra el mensaje de mismatch.
- Crear plantilla con `{{1}}` mapeado a `contact.name`, asignar como
  `openingTemplateId` → éxito, igual que el flujo actual.
- Plantilla vieja con `variables = null` → se sigue pudiendo asignar a cualquier rol
  sin bloqueo (retrocompatibilidad).
- Abrir modal "ver" en una plantilla con `bodyText` largo → texto completo visible sin
  cortar.
- Navegar a `/dashboard/settings/channels/templates` → misma data que hoy trae el
  panel, ahora en layout full-width.
