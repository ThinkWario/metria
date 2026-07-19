# AI Agent: Split Qualifier / Responder Design

## Context

**Incident:** On 2026-07-19, Gemini 2.5 Flash (via the legacy `@google/generative-ai` SDK, v0.24.1) leaked its internal "thinking" trace and a text-form pseudo tool-call directly into a WhatsApp message sent to a real customer:

```
tool_code
print(default_api.update_qualification(contactId='🪬', data={'timeline': 'lo antes posible'}, temperature='HOT'))
print(default_api.tag_contact(contactId='🪬', name='timeline-asap'))
thought
The user wants to install the solar system as soon as possible...¡Excelente! Queremos que empieces a ahorrar cuanto antes...
```

**Root cause:** `gemini.provider.ts`'s `wrapResult()` treats the entire response as final `text` whenever `response.functionCalls()` is empty. Gemini 2.5 Flash has "thinking" enabled by default; the legacy SDK has no `thinkingConfig` support and doesn't separate thought/tool-call parts from the answer. When the model chose to write a function call as pseudo-code text instead of a structured `functionCall` part, nothing caught it — no tool loop ran, no filter applied, and it went straight to the customer.

**Second-order bug:** because `functionCalls()` was empty, `update_qualification`/`tag_contact` never actually executed (no DB write), even though the leaked text implied they did. The CRM update the model "believed" it made never happened.

**Direction (user decision):** stop mixing CRM side-effects (via native function-calling) with customer-facing text generation in the same LLM call. Split into two independent processes: one that qualifies (writes to CRM, never talks to the customer) and one that responds to the customer (never touches CRM directly).

## Goals

- Eliminate the specific leak vector: a CRM-tool-call rendered as text ending up in a customer message.
- Stop losing CRM writes silently when the model's function-calling format slips.
- Keep response latency reasonable — user chose parallel execution over sequential for this reason.
- Support both existing LLM providers (Gemini, NVIDIA) — no functional regression for NVIDIA-configured workspaces.

## Non-goals

- Migrating off the deprecated `@google/generative-ai` SDK to `@google/genai`. Flagged as a separate root-cause fix; not required once the qualifier stops relying on function-calling and the responder's tool surface is much smaller.
- Eliminating 100% of leak risk in the responder path. The responder still uses native function-calling for `search_catalog` / `get_available_slots` / `schedule_appointment`, so the same failure mode is theoretically still possible there — mitigated with a dedicated guard (below), not eliminated by architecture alone.
- Reworking the debounce/retry logic in `aiResponder.ts` — unchanged.

## Architecture

`processAiResponse()` in `ai.service.ts` changes from a single function-calling loop to:

1. Load shared context once (conversation, contact, deal, agent profile, knowledge retrieval) — same queries as today, done once, reused by both branches.
2. Fire two LLM calls in parallel via `Promise.allSettled` (not `Promise.all` — a qualifier failure must never block the customer-facing reply):
   - **Qualifier**: structured JSON output, no tools declared. Only ever produces internal data; its output never reaches the customer.
   - **Responder**: function-calling chat, scoped to `search_catalog`, `get_available_slots`, `schedule_appointment` only.
3. Qualifier branch rejected → log and ignore (no qualification signal applied this turn).
4. Responder branch rejected → rethrow (preserves existing `aiResponder.ts` retry + internal-failure-note behavior, unchanged).
5. Apply the qualifier's JSON output as direct Prisma writes in `ai.service.ts` (no model-invoked function calls for these).
6. If `qualifierOutput.needsHuman?.value === true`: discard the responder's text (even though it already ran), perform the same handover as today (`isHandledByBot = false`, internal log message, `return null`).
7. Otherwise: run the responder's text through `codeLeakGuard` → `stripUnknownUrls` → `sanitizeResponse` (in that order) and return it.

```
processAiResponse
├── load context (once)
├── Promise.allSettled([runQualifier(...), runResponder(...)])
├── qualifier settled → applyQualifierOutcome() (Prisma writes)
├── qualifier rejected → console.error, no-op
├── responder rejected → rethrow
├── needsHuman true → handover, return null
└── else → codeLeakGuard → stripUnknownUrls → sanitizeResponse → return text
```

## Qualifier

### Provider interface addition

```ts
// types.ts
export interface LLMProvider {
  chat(input: { system: string; messages: ChatMessage[]; tools: ToolDeclaration[] }): Promise<ChatResult>
  embed(texts: string[]): Promise<number[][]>
  extract<T>(input: { system: string; messages: ChatMessage[]; schema: JSONSchemaObject }): Promise<T | null>
}
```

`extract()` never throws — any failure (network error, invalid JSON, schema mismatch) resolves to `null`. Same fail-safe philosophy as `transcribeAudio()` and `stripUnknownUrls()`'s conservative-block default.

### Per-provider implementation

- **`gemini.provider.ts`**: `genAI.getGenerativeModel({ model: CHAT_MODEL, generationConfig: { responseMimeType: 'application/json', responseSchema } })`, then `JSON.parse(result.response.text())` wrapped in try/catch → `null` on failure. Native support already present in the installed SDK version — no SDK migration required for this. Gemini's `responseSchema` actually constrains the model's output shape.
- **`nvidia.provider.ts`**: `response_format: { type: 'json_object' }` in the chat-completions body (standard OpenAI-compatible field), then `JSON.parse(choice.message.content)` wrapped in try/catch → `null` on failure. **Important asymmetry**: `json_object` mode only guarantees syntactically valid JSON — it does not enforce a specific shape the way Gemini's `responseSchema` does. The `schema` param is therefore used two different ways per provider: Gemini passes it to the API as an enforced constraint; NVIDIA only renders it into the system prompt as an instruction ("responde en este formato JSON: ..."), best-effort. This is exactly why every field in `QualifierOutput` must stay optional and `applyQualifierOutcome()` must tolerate missing/unexpected fields rather than assuming full conformance — cheap insurance against a provider that can't actually enforce the contract.

### Output schema

```ts
interface QualifierOutput {
  qualification?: {
    temperature?: 'COLD' | 'WARM' | 'HOT'
    type?: 'CURIOUS' | 'QUOTING' | 'READY_TO_BUY' | 'POST_SALE'
    score?: number
    data?: Record<string, string>
  }
  tags?: string[]
  statusChange?: 'LEAD' | 'PROSPECT' | 'CUSTOMER'
  deal?: { action: 'create' | 'move'; title?: string; value?: number; stageName?: string }
  needsHuman?: { value: boolean; reason?: string }
}
```

All fields optional — the model omits whatever has no signal this turn. `applyQualifierOutcome()` in `ai.service.ts` applies only the fields present, calling the same underlying functions the tool handlers use today (`updateContact`, `updateQualification`, `addTag`, `createDeal`/pipeline-stage update, conversation handover update) — just invoked directly from parsed JSON instead of from a model-issued function call.

### Qualifier system prompt

New, separate from the responder's. Contains: agent identity, current lead qualification state, pending qualification questions, and rules for when to set each field (moved from today's "REGLAS DURAS" in `compileSystemPrompt()`) plus the customer's message. Deliberately excludes business description, offer, knowledge chunks, and objections — not needed for classification, keeps the prompt small and the surface for leakage minimal.

The 6 tools that move from Gemini function-calling to this JSON path: `qualify_lead`, `create_deal`, `move_deal`, `update_qualification`, `tag_contact`, `handover_to_human`. These are removed from `toolDeclarations` in `ai.service.ts` (or rather, that array is split — see Responder section).

## Responder

Same mechanism as today (`chat()` + tool loop), scoped down:

- Tools: `search_catalog`, `get_available_slots`, `schedule_appointment` only — the ones whose results must be reflected verbatim in the customer-facing text (product info, real slot times, confirmed appointment).
- `compileSystemPrompt()` drops the "REGLAS DURAS" bullet about calling `update_qualification`/`tag_contact` (moved to the qualifier's prompt). Keeps business/offer/knowledge/objections/playbook sections unchanged.
- New `codeLeakGuard.ts`, same shape as `urlGuard.ts`:

```ts
const LEAK_MARKERS = [/^\s*tool_code\b/im, /default_api\./i, /^\s*thought\s*$/im]

export function blockLeakedInternals(text: string): string {
  if (LEAK_MARKERS.some(re => re.test(text))) {
    console.warn('[AI Agent] Blocked leaked internal trace in AI response')
    return 'Dame un segundo, reviso eso y te confirmo.'
  }
  return text
}
```

  Applied first in the output pipeline, before `stripUnknownUrls` and `sanitizeResponse`. This is defense-in-depth: the responder still does native function-calling for its 3 tools, so the same failure mode (model writes a call as text instead of a structured part) is still theoretically possible there. The 6-tool CRM prompt that likely contributed to the original confusion is gone from this path, which should reduce — not guarantee zero — recurrence.

## Error handling

- `extract()` (qualifier) — never throws. `null` → no qualification applied this turn, logged via `console.error` in the orchestrator's `allSettled` handling.
- `chat()` (responder) — unchanged behavior. A rejection propagates out of `processAiResponse()`, caught by `aiResponder.ts`'s existing retry (3 attempts) and internal-failure-note fallback. Not modified by this design.
- `codeLeakGuard` — never throws, mirrors `stripUnknownUrls`'s conservative-block-and-fallback pattern.

## Testing

- `extract()` unit tests for both providers: valid JSON → parsed object; malformed JSON → `null`; network/API error → `null`. Mirrors `gemini.provider.test.ts` / existing NVIDIA test conventions.
- `codeLeakGuard.test.ts`: the exact leaked text from the 2026-07-19 incident as a regression case (must be blocked); plain conversational text (must pass through unchanged).
- `ai.service.test.ts`: rewritten for the two-parallel-call shape — mocks `chatMock` (responder) and a new `extractMock` (qualifier); existing assertions that checked tool-call args for CRM tools (`update_qualification`, `tag_contact`, etc.) become assertions on `applyQualifierOutcome()`'s Prisma calls, driven by mocked `QualifierOutput` JSON instead of mocked tool calls.
- Full backend suite + typecheck on all touched files before merge, per existing project convention.

## Trade-offs (called out, not decided here)

- **Cost/latency**: every turn now pays for two LLM calls instead of one that conditionally invoked tools. Previously the "extra round trip" cost was only incurred when the model actually called a tool; now it's paid unconditionally, every turn, in both directions (qualifier JSON call + responder call). This was an explicit trade-off the user made in favor of reliability and speed via parallelism over a sequential single-pipeline approach.
- **No cross-awareness**: because the two calls run in parallel, the responder cannot reference what the qualifier just recorded this turn (e.g., cannot say "anoté que prefieres pagar al contado" in the same turn it was captured) — only on the next turn, once qualification data is persisted and shows up in context. User explicitly chose this over the sequential alternative.
