# Metria - E-commerce Metrics Dashboard

## Arquitectura del Sistema

Metria es una plataforma centralizada para el cálculo de utilidad neta (Profit) en tiempo real, integrando fuentes de e-commerce y logística. Su arquitectura incluye:
- **Middleware/Automations**: n8n para la orquestación de webhooks (Shopify, Meta, Dropy) y agente IA (Valentina).
- **Backend**: API REST con Node.js (Express) + PostgreSQL para consolidación de datos y cálculos rápidos.
- **Frontend**: Aplicación web de Dashboard con Next.js 15 y Recharts para visualización en tiempo real.

## Stack Tecnológico

### Backend (Node.js/Express)
- **Framework**: Express.js (Node.js)
- **Base de datos**: PostgreSQL 15
- **ORM**: Prisma ORM
- **Cache**: Redis (para cálculos pesados de ROAS/Profit)
- **Container**: Docker + Docker Compose
- **Gestión dependencias**: pnpm
- **Puerto**: 4000

### Frontend (Next.js)
- **Framework**: Next.js 15 (App Router)
- **React**: 19.0
- **Visualización**: Recharts / Chart.js
- **Estilos**: Tailwind CSS + Shadcn/ui
- **Lenguaje**: TypeScript estricto
- **Puerto**: 3000

### Middleware (n8n)
- **Plataforma**: n8n (Self-hosted via Docker)
- **Integraciones**: Meta Ads API, Shopify Webhooks, Dropy API, WhatsApp API.

## Estructura del Proyecto

drofit-clone/
├── Backend/           # API Express + Prisma + PostgreSQL
├── Frontend/          # Next.js 15 Dashboard App
└── n8n/
    ├── workflows/     # JSON exportados de flujos n8n
    └── docker/        # Configuración de contenedores n8n


## Modelo de Datos

### Entidades Principales
- **Order**: Pedidos de Shopify (order_id, revenue, date, status, customer_id)
- **AdSpend**: Gasto publicitario de Meta Ads (campaign_id, spend, date, impressions, clicks)
- **Shipment**: Logística de Dropy (tracking_id, order_id, shipping_cost, delivery_status)
- **DailyMetric**: Tabla consolidada para lecturas rápidas (date, total_revenue, total_ad_spend, total_shipping, net_profit)

### Relaciones
- Order ↔ Shipment (One-to-One via order_id)
- DailyMetric consolida (Order, AdSpend, Shipment) agrupados por fecha.

## API Endpoints

- `GET /health` - Health check + DB/Redis connectivity
- `POST /webhooks/shopify` - Ingreso de nuevas órdenes
- `POST /webhooks/dropy` - Actualización de estados de envío
- `GET /api/metrics/daily` - Obtiene el profit y gastos del día actual
- `GET /api/metrics/range` - Obtiene métricas filtradas por rango de fechas
- `GET /api/ia/valentina-context` - Endpoint dedicado para que el agente IA consulte ventas en tiempo real

## Comandos de Desarrollo

### Backend
```bash
cd Backend
make start        # Iniciar Docker Compose (DB + Redis + API)
make stop         # Detener containers
npx prisma push   # Sincronizar esquema de base de datos
make seed         # Poblar datos de prueba (mock Shopify/Meta)
make logs         # Ver logs del backend
Frontend
Bash
cd Frontend
pnpm install      # Instalar dependencias
pnpm dev          # Servidor de desarrollo
pnpm build        # Build de producción
pnpm lint         # Ejecutar Linter
URLs del Sistema
Backend API: http://localhost:4000

Frontend Web: http://localhost:3000

n8n Instancia: http://localhost:5678

Base de Datos (Admin): localhost:5432

Base de Datos
Configuración Docker
Usuario: drofit_user

Password: drofit_password

Database: drofit_metrics_db

Puerto: 5432

Migraciones (Prisma)
Ubicación: Backend/prisma/schema.prisma

Comando crear/aplicar: npx prisma migrate dev --name init

Funcionalidades Implementadas
✅ Integración de Webhooks de Shopify para captura de ventas al instante.

✅ Extracción diaria de Ad Spend desde Meta Ads API.

✅ Cruce de costos logísticos desde Dropy.

✅ Dashboard en tiempo real con cálculo automático de Utilidad Neta (Profit).

✅ Endpoint exclusivo para que la IA (Valentina) pueda leer el estado de un pedido o las ventas del día.

✅ Alertas de margen de contribución bajo (Traffic Lights).

Patrones de Desarrollo
Backend
Arquitectura: Arquitectura Hexagonal / Controller-Service-Repository

Data Fetching: Event-Driven (basado en Webhooks) para evitar cuellos de botella.

Caching: Uso de Redis para métricas del dashboard (evita saturar PostgreSQL con querys SUM/GROUP BY constantes).

Frontend
Routing: Next.js App Router

State Management: Zustand para estado global (filtros de fechas).

Styling: Tailwind CSS + Componentes modulares.

Middleware (n8n)
Error Handling: Nodos de "Error Trigger" para notificar fallos de API por WhatsApp o Slack.

Normalización: Nodos de código (JavaScript) para estandarizar monedas y husos horarios (America/Santiago).

Consideraciones de Desarrollo
Docker obligatorio para levantar los servicios de BD, Redis y n8n.

TypeScript strict en Frontend y Backend.

El huso horario oficial del sistema es America/Santiago (-03:00). Todas las fechas ISO deben guardarse con este offset.

Cálculo de Profit: La ecuación central del sistema es siempre Ventas - Gasto Ads - Costo Producto/Envío.

API REST es la única fuente de verdad. n8n no debe escribir directamente en PostgreSQL, debe llamar a los endpoints del Backend.

Comandos Útiles
Bash
# Desarrollo completo
cd Backend && make start    # Iniciar infraestructura
cd n8n && docker-compose up -d # Iniciar flujos de automatización
cd Frontend && pnpm dev     # Iniciar dashboard

# Ver logs de la base de datos
docker logs -f drofit_postgres