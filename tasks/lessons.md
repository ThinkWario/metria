# Lessons Learned

## User Rules & Process
- **Pattern**: Failing to explicitly announce the agent being used and skipping the Socratic Gate.
- **Correction**: Always analyze, select, and announce the agent at the start of the response. Never use tools or implement code before passing the Socratic Gate for complex or meta-requests.
- **Orchestration**: Specifically for `/orchestrate`, mandatory to create `docs/PLAN.md` first, use 3+ agents, and provide the final `Orchestration Report` table.
- **Rule**: Follow `GEMINI.md` and user-defined `⚡️ Visual & Functional Quality Gate` strictly.

## Technical Patterns (Recurring Errors)
- **Hydration (Next.js)**: components using shared state (Zustand/LocalStorage) MUST use the `Mounted` pattern.
  ```tsx
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <Skeleton />;
  ```
- **Shopify Sync**: Never assume `item.price` is valid. Always validate `price > 0` and log anomalies to `AuditLog`.
- **API Routing**: When creating a new route, verify its registration in `app.ts` and test with a direct `curl` before connecting the frontend.
- **SEO**: Every `page.tsx` must export a `Metadata` object to avoid failures in `checklist.py`.
