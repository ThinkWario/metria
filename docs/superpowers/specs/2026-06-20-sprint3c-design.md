# Sprint 3C Design — ROAS en Contacto + Catálogo Productos + Invoice PDF

**Date:** 2026-06-20  
**Scope:** 3 diferenciadores únicos que GHL no tiene bien resueltos; cierra brecha en CRM (9.5→10) y Pagos (5→7)  
**Repo:** `C:\Proyectos\Metria` (monorepo Backend + Frontend)

---

## Context

Metria ya tiene: DailyMetric (revenue/adSpend/netProfit por día), Order model (linked a contacto por email), Deal model (con value/stage/status WON/LOST), Contact model con `source` field, html2canvas + jsPDF instalados en frontend, panel "Valor del cliente" en perfil de contacto (LTV + deals ganados + pipeline).

Lo que falta para superar a GHL en estos diferenciadores:

| Gap | Target |
|-----|--------|
| Panel LTV sin datos de e-commerce reales | ROAS/utilidad real desde Orders + DailyMetric |
| Sin catálogo de productos | Catálogo básico para invoices y order forms |
| Sin generación de facturas | Invoice PDF desde deal ganado |

---

## Feature 1 — ROAS/Utilidad en Vista de Contacto

### Objetivo

El panel "Valor del cliente" existente muestra datos de CRM (deals, pipeline). Esta feature añade la capa de e-commerce: cuánto revenue real generó este contacto desde Shopify/Orders, y cómo se compara con el ROAS promedio del workspace.

### Endpoint Backend

```
GET /api/crm/contacts/:id/revenue-summary
Authorization: Bearer JWT (workspaceId extraído del token)
```

**Response:**
```json
{
  "contactRevenue": {
    "totalRevenue": 450000,
    "orderCount": 3,
    "lastPurchaseDate": "2026-05-10T14:23:00Z",
    "avgOrderValue": 150000
  },
  "workspaceContext": {
    "avgROAS": 3.2,
    "totalAdSpend30d": 180000,
    "totalRevenue30d": 576000,
    "netProfit30d": 220000
  },
  "contactAttribution": {
    "source": "META",
    "estimatedAdCost": null,
    "note": "Atribución exacta no disponible — mostrando ROAS promedio del workspace"
  }
}
```

**Lógica Backend:**

```typescript
// 1. Buscar el Contact para obtener su email
const contact = await prisma.contact.findUnique({ where: { id, workspaceId } })

// 2. Agregar Orders por email del contacto
const orders = await prisma.order.findMany({
  where: { workspaceId, customerEmail: contact.email ?? '' }
})
const totalRevenue = orders.reduce((sum, o) => sum + Number(o.totalPrice), 0)
const lastPurchaseDate = orders.sort(...)[0]?.createdAt ?? null

// 3. ROAS workspace: últimos 30 días desde DailyMetric
const since = new Date(Date.now() - 30 * 86_400_000)
const metrics = await prisma.dailyMetric.aggregate({
  where: { workspaceId, date: { gte: since } },
  _sum: { revenue: true, adSpend: true, netProfit: true }
})
const avgROAS = metrics._sum.adSpend > 0
  ? metrics._sum.revenue / metrics._sum.adSpend
  : null
```

**Registro en routes:** Añadir en `Backend/src/modules/crm/crm.routes.ts` (misma agrupación que el resto de endpoints de contacto).

### Frontend — Sección nueva en ContactPanel

En `/dashboard/crm/contacts/[id]` — añadir tab o sección colapsable "Performance e-commerce":

```
┌─────────────────────────────────────────┐
│ Performance e-commerce                  │
├──────────────┬──────────────┬───────────┤
│ Revenue total│ Pedidos      │ Último    │
│ $450.000     │ 3            │ 10 may    │
├──────────────┴──────────────┴───────────┤
│ ROAS workspace (30d): 3.2x              │
│ Fuente: [META] badge                   │
│ ⚠ Atribución exacta no disponible      │
└─────────────────────────────────────────┘
```

Si `contact.email` es null → mostrar "Sin email — no se pueden cruzar pedidos".  
Si `orderCount === 0` → mostrar "Sin pedidos registrados en Shopify".

**Archivo a modificar:** `metria-metrics/Frontend/src/app/dashboard/crm/contacts/[id]/` (el componente de contacto existente).

---

## Feature 2 — Catálogo de Productos Simple

### Modelo Prisma

```prisma
model Product {
  id          String   @id @default(cuid())
  workspaceId String
  name        String
  description String?
  price       Decimal  @db.Decimal(12, 2)
  currency    String   @default("CLP")
  sku         String?
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  lineItems   InvoiceLineItem[]

  @@index([workspaceId, isActive])
}
```

### Endpoints Backend

```
GET    /api/products           → List activos (isActive=true) del workspace
POST   /api/products           → Crear producto
PUT    /api/products/:id       → Actualizar producto
DELETE /api/products/:id       → Soft delete (isActive=false)
```

**Body POST/PUT:**
```json
{
  "name": "Consultoría Solar 3kW",
  "description": "Asesoría técnica + visita domiciliaria",
  "price": 150000,
  "currency": "CLP",
  "sku": "SOL-CONS-3KW"
}
```

**Validaciones:**
- `name`: requerido, max 200 chars
- `price`: requerido, > 0, máx 12 dígitos
- `currency`: ISO 4217, default CLP
- `sku`: opcional, único por workspace si se provee

**Nuevo módulo:** `Backend/src/modules/products/products.routes.ts` + `products.service.ts`. Registrar en `app.ts`.

### Frontend — Página /dashboard/products

Nueva página `metria-metrics/Frontend/src/app/dashboard/products/page.tsx`:

```
┌──────────────────────────────────────────────────┐
│ Productos                          [+ Nuevo]      │
├──────────────────────────────────────────────────┤
│ Nombre          │ SKU          │ Precio │ Estado  │
├─────────────────┼──────────────┼────────┼─────────┤
│ Consultoría 3kW │ SOL-CONS-3KW │$150.000│ Activo  │
│ Instalación 5kW │ SOL-INST-5KW │$890.000│ Activo  │
└──────────────────────────────────────────────────┘
```

- DataTable con shadcn/ui (mismo patrón que `/dashboard/crm/contacts`)
- Sheet lateral para crear/editar (nombre, descripción, SKU, precio, moneda)
- Acción "Desactivar" en menú de fila (soft delete)
- Añadir enlace en sidebar bajo "Pagos" o nueva sección "Catálogo"

---

## Feature 3 — Invoice PDF desde Deal Ganado

### Modelos Prisma

```prisma
model Invoice {
  id          String   @id @default(cuid())
  workspaceId String
  contactId   String
  dealId      String?
  number      String   // "INV-0001" — único por workspace
  lineItems   Json     // InvoiceLineItem[]
  subtotal    Decimal  @db.Decimal(12, 2)
  taxRate     Decimal  @db.Decimal(5, 4) @default(0)  // 0.19 = 19%
  total       Decimal  @db.Decimal(12, 2)
  currency    String   @default("CLP")
  issuedAt    DateTime @default(now())
  createdAt   DateTime @default(now())

  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  contact     Contact   @relation(fields: [contactId], references: [id])
  deal        Deal?     @relation(fields: [dealId], references: [id])

  @@unique([workspaceId, number])
  @@index([workspaceId])
}
```

**Tipo InvoiceLineItem (en Json):**
```typescript
interface InvoiceLineItem {
  productId: string
  productName: string    // desnormalizado al crear
  qty: number
  unitPrice: number
  subtotal: number       // qty * unitPrice
}
```

### Auto-numeración de invoices

Al crear una invoice, el servidor genera el número:
```typescript
// Count existentes en el workspace + 1, formato INV-XXXX (4 dígitos, 0-padded)
const count = await prisma.invoice.count({ where: { workspaceId } })
const number = `INV-${String(count + 1).padStart(4, '0')}`
```

No usar `@@autoincrement()` para evitar gaps de secuencia en caso de rollback. Esta lógica es suficiente para el uso esperado.

### Endpoint Backend

```
POST /api/invoices
Body: {
  contactId: string,
  dealId?: string,
  lineItems: Array<{ productId: string, qty: number, unitPrice?: number }>,
  taxRate?: number  // default 0
}
```

**Lógica:**
1. Validar que todos los `productId` pertenecen al workspace y están activos
2. Enriquecer lineItems con `productName` y calcular `subtotal` por línea
3. Calcular `subtotal` total (suma de subtotals), aplicar `taxRate`, calcular `total`
4. Auto-generar `number`
5. Crear `Invoice` en DB
6. Devolver invoice completa

**Response:**
```json
{
  "id": "clxxx",
  "number": "INV-0003",
  "contact": { "name": "Juan Solar", "email": "juan@sol.cl" },
  "workspace": { "name": "SolarTech SPA" },
  "lineItems": [
    { "productName": "Consultoría 3kW", "qty": 1, "unitPrice": 150000, "subtotal": 150000 }
  ],
  "subtotal": 150000,
  "taxRate": 0,
  "total": 150000,
  "currency": "CLP",
  "issuedAt": "2026-06-20T10:00:00Z"
}
```

Registrar en `Backend/src/modules/payments/invoices.routes.ts` (junto a payment links existentes). Registrar en `app.ts`.

### Frontend — Flujo de generación

**Trigger:** En la vista de deal (cuando `deal.status === 'WON'`), mostrar botón "Generar Factura".

**Modal — InvoiceModal:**
```
┌─────────────────────────────────────────┐
│ Generar Factura                    [×]  │
├─────────────────────────────────────────┤
│ Para: Juan Solar (juan@sol.cl)          │
│                                         │
│ Líneas de factura:                      │
│ [+ Agregar producto]                    │
│ ┌──────────────────┬────┬──────────────┐│
│ │ Consultoría 3kW  │ x1 │ $150.000     ││
│ └──────────────────┴────┴──────────────┘│
│                                         │
│ IVA (%): [0    ]                        │
│                      Subtotal: $150.000 │
│                      Total:    $150.000 │
│                                         │
│              [Cancelar] [Generar PDF]   │
└─────────────────────────────────────────┘
```

**Al hacer "Generar PDF":**
1. POST /api/invoices → recibe invoice data
2. Render `<InvoiceTemplate invoice={data} />` en un `div` oculto con `ref`
3. `html2canvas(ref.current, { scale: 2 })` → canvas
4. `jsPDF('p', 'mm', 'a4')` → `pdf.addImage(canvas, 'PNG', ...)` → `pdf.save('INV-0001.pdf')`
5. Modal se cierra, toast "Factura generada"

**InvoiceTemplate** — componente React puro (no Next.js, sin server components):
```
┌────────────────────────────────────────────────┐
│  [Logo/Nombre Workspace]        FACTURA         │
│  SolarTech SPA                  INV-0001        │
│                                 20 jun 2026     │
├────────────────────────────────────────────────┤
│ Para:                                           │
│ Juan Solar                                      │
│ juan@sol.cl                                     │
├────────────────────────────────────────────────┤
│ Concepto               Cant   Precio   Subtotal │
│ Consultoría 3kW          1  $150.000  $150.000  │
├────────────────────────────────────────────────┤
│                              Subtotal $150.000  │
│                              IVA (0%) $0        │
│                              TOTAL    $150.000  │
└────────────────────────────────────────────────┘
```

Estilos inline (no Tailwind) para garantizar render correcto en html2canvas.

**Archivos Frontend:**
- `src/components/invoices/InvoiceModal.tsx` — CREAR
- `src/components/invoices/InvoiceTemplate.tsx` — CREAR (HTML inline styles)
- `src/app/dashboard/crm/deals/[id]/page.tsx` — MODIFICAR (añadir botón + modal)
- `src/app/dashboard/products/page.tsx` — CREAR (catálogo)
- `src/components/products/ProductSheet.tsx` — CREAR (create/edit sheet)

---

## Data Model Changes (Prisma)

```prisma
// Nuevos modelos
model Product { ... }   // ver arriba
model Invoice { ... }   // ver arriba

// Sin cambios en modelos existentes
// Contact ya tiene email (usado para revenue-summary)
// Deal ya tiene status (WON/LOST)
// Workspace ya existe (referenciado desde Product e Invoice)
```

---

## Files to Create / Modify

### Backend

| Archivo | Acción |
|---------|--------|
| `prisma/schema.prisma` | MODIFICAR — añadir Product, Invoice |
| `src/modules/products/products.routes.ts` | CREAR |
| `src/modules/products/products.service.ts` | CREAR |
| `src/modules/payments/invoices.routes.ts` | CREAR |
| `src/modules/payments/invoices.service.ts` | CREAR |
| `src/modules/crm/crm.routes.ts` | MODIFICAR — añadir GET /contacts/:id/revenue-summary |
| `src/app.ts` | MODIFICAR — registrar products + invoices routes |

### Frontend

| Archivo | Acción |
|---------|--------|
| `src/app/dashboard/products/page.tsx` | CREAR |
| `src/components/products/ProductSheet.tsx` | CREAR |
| `src/app/dashboard/crm/contacts/[id]/page.tsx` o componente | MODIFICAR — sección e-commerce |
| `src/app/dashboard/crm/deals/[id]/page.tsx` o lista de deals | MODIFICAR — botón factura |
| `src/components/invoices/InvoiceModal.tsx` | CREAR |
| `src/components/invoices/InvoiceTemplate.tsx` | CREAR |
| `src/components/layout/Sidebar.tsx` | MODIFICAR — link a /dashboard/products |

---

## Out of Scope (Sprint 3C)

- Order forms con pago integrado (necesita catálogo + Stripe/MP, Sprint 4)
- Envío de invoices por email (Sprint 4)
- Historial de invoices como página independiente (Sprint 4)
- Atribución exacta de ad spend por contacto (requiere UTM tracking avanzado)

---

## Success Criteria

1. `GET /api/crm/contacts/:id/revenue-summary` devuelve revenue real de Orders + ROAS workspace
2. Contacto con source='META' muestra badge + ROAS workspace en panel e-commerce
3. CRUD completo de productos funciona; soft delete oculta el producto de la lista
4. Producto desactivado no aparece en el selector de invoice
5. POST /api/invoices genera número auto-correlativo (INV-0001, INV-0002...)
6. Click "Generar PDF" en deal ganado → descarga archivo `INV-XXXX.pdf` con datos correctos
7. `prisma db push` sin errores; build backend y frontend limpios
