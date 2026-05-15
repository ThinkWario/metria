# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Workflow orchestration, task management, and core principles are defined in the parent `c:\Proyectos\CLAUDE.md` and apply here.

## Project Overview

Metria Metrics is a multi-tenant SaaS e-commerce analytics platform. It calculates net profitability, ROAS, and logistics costs by integrating with Shopify, Meta Ads, Google Ads, TikTok Ads, and Dropi (logistics).

## Monorepo Structure

```
Metria/
├── metria-metrics/Frontend/   # Next.js 16 + React 19 app (port 3000)
├── Backend/                   # Express.js + Prisma API server (port 4000)
├── docs/PLAN.md               # Project plan and orchestration verification
├── tasks/                     # todo.md, lessons.md (review at session start)
└── audit.md                   # Visual & functional quality gate definition
```

## Commands

### Frontend (`metria-metrics/Frontend/`)
```bash
pnpm dev              # Dev server at http://localhost:3000
pnpm build            # Production build
pnpm lint             # ESLint
pnpm test             # Vitest unit tests
pnpm test:coverage    # Coverage report
```

### Backend (`Backend/`)
```bash
npm run dev           # tsx watch (hot reload)
npm run build         # tsup → dist/
npm run db:push       # Sync Prisma schema to DB
npm run db:studio     # Prisma Studio GUI
npm run seed          # Seed the database
npm run lint          # ESLint on src/
```

### Infrastructure
```bash
# From Backend/ — start PostgreSQL 15 + Redis 7
docker compose up -d
```

## Architecture

### Frontend Tech Stack
- **Next.js 16** App Router, TypeScript, Tailwind CSS 4
- **shadcn/ui** (New York style) + Radix UI for components
- **Zustand 5** for state management (4 stores: user, workspace, dateRange, campaign)
- **Recharts 3** for analytics charts
- **Three.js + @react-three/fiber** for 3D effects (TiltCard component)
- **Framer Motion + GSAP + Lenis** for animations and smooth scroll
- **html2canvas + jsPDF** for PDF dashboard export

### Backend Tech Stack
- **Express.js 4** with Helmet, CORS, Compression
- **Prisma 5** ORM on **PostgreSQL 15**
- **Redis 7** (ioredis) for caching
- **JWT** auth (stateless); tokens stored in browser `localStorage` as `metria_token`

### Data Flow
1. Shopify and Dropi **push webhooks** → Backend validates HMAC → stores in DB → logs to `AuditLog`
2. Meta, Google, TikTok data is **pulled** via scheduled sync routes
3. Frontend calls `/api/*` with Bearer token → `src/lib/api.ts` (`fetchAPI()`) injects auth automatically
4. `DailyMetric` table stores pre-aggregated revenue, costs, and net profit per day

### Frontend Coding Patterns

**Zustand + localStorage → always use Mounted pattern** to avoid Next.js hydration errors:
```tsx
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []);
if (!mounted) return <Skeleton />;
```

**Every `page.tsx`** must export a `Metadata` object for SEO.

### Backend Coding Patterns

**New routes** must be registered in `Backend/src/app.ts`. Test with `curl` before wiring the frontend.

**Shopify price validation** — always validate `item.price > 0`; log anomalies to `AuditLog`.

**Multi-tenancy** — all DB queries must be scoped to `workspaceId`.

## Environment Variables

Backend `.env` (see `Backend/.env.example`):
- `PORT=4000`, `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`
- `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_ACCESS_TOKEN`, `SHOPIFY_WEBHOOK_SECRET`
- `META_APP_ID/SECRET/ACCESS_TOKEN/AD_ACCOUNT_ID`
- `GOOGLE_ADS_CLIENT_ID/SECRET/REFRESH_TOKEN/DEVELOPER_TOKEN/MANAGER_ID/CUSTOMER_ID`

Frontend: `NEXT_PUBLIC_API_URL` (defaults to `http://127.0.0.1:4000/api`)

## Quality Gate (`/audit`)

Defined in `audit.md`. Required threshold: **≥9/10** on Visual, Functional, and Trust scores.
- Bento grid layout with glassmorphism cards; pages scannable in <3 seconds
- Buttons acknowledge input in <100ms
- Every data-fetching page needs loading (skeleton), empty, error, and success (toast) states
- Optimistic UI for mutations

If a score is below 9: fix → re-audit (max 3 attempts). Passing commits use the `[AUTO-HEALED]` prefix.
