# Chat Quality Roadmap (Phases 1–4)

**Parent:** [03-chat-orchestration.md](../functions/03-chat-orchestration.md)  
**Implementation:** `packages/core/src/chat/`  
**Last updated:** 2026-06-16  
**Status:** Phases 1–4 shipped · deployed to AWS dev 2026-06-16

---

## 1. Overview

CommerceChat uses a **single orchestrator** (`runChatOrchestrator`) — not separate qualifier / recommender / closer microservices. Sales-funnel behavior is layered via:

| Logical role | Implementation |
|--------------|----------------|
| Qualifier | `funnelStage` + `qualification` slots + prompt hints |
| Recommender | `search_products`, `compare_products`, `get_related_products` |
| Closer | Stage CTAs + `add_to_cart` + `create_checkout_link` + widget actions |

Human **handoff** (`handlingMode: human`) is separate from the sales funnel.

```mermaid
flowchart TB
  ORCH[runChatOrchestrator]
  F[resolveFunnelContext]
  I[detectIntent]
  R[RAG + LLM + tools]
  C[CTA builder — Phase 4]
  ORCH --> F --> I --> R --> C
```

---

## 2. Phase 1 — Shipped

| Area | Changes |
|------|---------|
| Prompts | Anti-hallucination rules, intent hints, RAG 800 chars, `pageUrl` |
| Intent | `messageMentionsProducts()`, broader RAG for mixed FAQ+product |
| Tools | Merge cache+vector hits; `getProductBySku` for prices |
| Reply | `product-reply.ts` — enrich reply after search |
| Orchestrator | Tenant `temperature` / `maxOutputTokens`, post-hoc search sync |
| Eval | `apps/api/scripts/eval-chat.mjs` smoke tests |

---

## 3. Phase 2 — Session / funnel state

**Goal:** Persist shopper journey stage and use it for prompts, tools, and analytics.

### 3.1 Data model

On `ConversationState` (DynamoDB `CONV#` item):

```typescript
type FunnelStage = "discover" | "compare" | "objection" | "cart" | "checkout";

interface QualificationState {
  budget?: { min?: number; max?: number };
  category?: string;
  recipient?: string;
  constraints?: string[];
  objectionsRaised?: string[];
  lastComparedSkus?: string[];
}
```

Default new conversations → `funnelStage: "discover"`.

### 3.2 Transition rules (`packages/core/src/chat/funnel.ts`)

| Signal | Stage |
|--------|-------|
| Greeting / vague browse | `discover` |
| Product intent or product keywords | `compare` |
| Objection keywords (price, shipping, trust) | `objection` |
| Cart has items | `cart` |
| Checkout intent + cart | `checkout` |
| New product search after checkout | `compare` |

Rules-first (same style as `intent.ts`). Optional LLM refinement deferred to Phase 3b.

### 3.3 Deliverables

| # | Task | Status |
|---|------|--------|
| 2a | Types, `funnel.ts`, orchestrator + prompt wiring | **Shipped** |
| 2b | Admin funnel badge on conversation detail | **Shipped** |
| 2c | Analytics `funnelStageBreakdown` from message metadata | **Shipped** |

### 3.4 Acceptance criteria

- Funnel stage visible on conversation in admin
- Stage stored on outbound message metadata
- Analytics counts per stage

---

## 4. Phase 3 — Qualification & sub-intents

**Goal:** Finer routing without replacing top-level `ChatIntent` (still drives model selection).

### 4.1 Sub-intents

```typescript
type ChatSubIntent =
  | "product_browse"
  | "product_compare"
  | "product_detail"
  | "faq_policy"
  | "faq_objection"
  | "cart_review"
  | "checkout_ready"
  | "order_status";
```

`detectSubIntent(message, intent, funnelStage, qualification)` in `intent.ts`.

### 4.2 Qualification extractor

- Rules: budget regex, category from catalog
- Optional nano LLM JSON extract (env-gated)
- At most **one** qualifying question per turn in `discover`

### 4.3 Objection-tagged FAQ

- FAQ chunk metadata: `tags: ["objection:price", "objection:shipping"]`
- Boost matching chunks when `funnelStage === "objection"`

### 4.4 Acceptance criteria

- [x] Sub-intent on message metadata
- [x] Qualification slots merged on conversation (`budget`, `category`, `recipient`, `objectionsRaised`)
- [x] Objection FAQ boost when chunks have `tags: ["objection:…"]`
- [ ] Objection FAQ hit rate ≥ 60% on eval set (when tags seeded)

### 4.5 Deliverables

| # | Task | Status |
|---|------|--------|
| 3a | `detectSubIntent`, qualification extract/merge, prompt + tool wiring | **Shipped** |
| 3b | FAQ `tags` in ingest + RAG objection boost | **Shipped** |
| 3c | Admin qualification display | **Shipped** |

---

## 5. Phase 4 — Sales tools, CTAs, widget, eval

### 5.1 New tools

| Tool | Purpose |
|------|---------|
| `compare_products` | Diff 2–4 SKUs (price, stock, attributes) |
| `get_related_products` | Same category; exclude cart / compared SKUs |

### 5.2 Proactive CTAs (`cta.ts`)

Stage-driven `suggestedActions` on every reply:

| Stage | Examples |
|-------|----------|
| `discover` | "Show best sellers" |
| `compare` | "Add [SKU] to cart" |
| `objection` | "View return policy" |
| `cart` | "Checkout now" |
| `checkout` | "Get checkout link" |

### 5.3 Widget actions

Extend `WidgetAction` with `action: "view" | "add_to_cart" | "checkout"`.

- `POST /api/v1/widget/cart` for idempotent add-to-cart (no LLM)
- Product card **Add to cart** button (today chips only send "Tell me more…")

### 5.5 Deliverables

| # | Task | Status |
|---|------|--------|
| 4a | `compare_products`, `get_related_products` | **Shipped** |
| 4b | `cta.ts` + orchestrator `suggestedActions` | **Shipped** |
| 4c | `POST /api/v1/widget/cart` + widget buttons | **Shipped** |
| 4d | Eval suite `cases.json` + `npm run eval:chat` | **Shipped** |

### 5.6 Acceptance criteria

- [x] Compare/related tools registered and gated by sub-intent
- [x] Every bot reply includes stage-appropriate CTAs (web)
- [x] Widget add-to-cart calls cart API directly
- [x] Eval pass rate ≥ 85% on dev API — **6/6 (100%)** on 2026-06-16

### 5.7 Deploy & verification (2026-06-16)

| Target | Result |
|--------|--------|
| API | `npm run deploy:aws` → `commercechat-dev-2026-06-16T20-05-02-022Z.json` |
| Admin | `npm run deploy:admin` |
| Widget CDN | `npm run deploy:widget` → invalidation `20-05-35` |

```bash
API_URL=https://fimfx57xwl.execute-api.us-east-1.amazonaws.com \
WIDGET_API_KEY=pk_live_... \
npm run eval:chat
```

Widget chat response includes `funnelStage`, `subIntent`, `suggestedActions` (with `action`: `view` \| `add_to_cart` \| `checkout`). Cart API returns `400 Product not found` for invalid SKU (expected).

---

## 6. Optional — OpenAI Agents SDK

**When:** After Phase 4 if tool rounds often hit `MAX_TOOL_ROUNDS` (3) or tool count > 6.

- Keep outer shell: quota, funnel, persist, widget envelope
- Replace inner LLM tool loop only
- Feature flag `LLM_AGENT_LOOP` per tenant
- **Not** AgentKit hosted (Builder sunsetting Nov 2026)

---

## 7. Build order

| Sprint | Deliverable |
|--------|-------------|
| 2a | Funnel types + transitions + orchestrator + prompts |
| 2b | Admin badge + analytics breakdown |
| 3a | Sub-intents + qualification slots |
| 3b | Objection FAQ tags in RAG |
| 4a | `compare_products`, `get_related_products` |
| 4b | CTA builder |
| 4c | Widget add-to-cart + cart API |
| 4d | Eval suite + CI |

**Estimate:** 4–6 weeks focused work.

---

## 8. Success metrics

| Phase | Metric |
|-------|--------|
| 2 | Product conversations reach `compare` or `cart` within 5 turns (eval sample) |
| 3 | ≤ 1 redundant qualify question; objection FAQ hits when tagged |
| 4 | Widget add-to-cart success ≥ 95%; eval pass ≥ 85% |

---

## 9. Key files

| File | Role |
|------|------|
| `packages/core/src/chat/orchestrator.ts` | Entry point |
| `packages/core/src/chat/funnel.ts` | Stage transitions |
| `packages/core/src/chat/intent.ts` | Intent + (Phase 3) sub-intent |
| `packages/core/src/chat/prompts.ts` | System prompt + funnel hints |
| `packages/core/src/chat/tools.ts` | Commerce tools |
| `packages/core/src/chat/cta.ts` | Phase 4 suggested actions |
| `packages/shared/src/types.ts` | Shared funnel types |
| `packages/core/src/chat/qualification.ts` | Budget/category/recipient slots |
| `packages/core/src/chat/rag-boost.ts` | Objection FAQ tag boost |
| `apps/api/scripts/eval-chat/` | Golden cases + `npm run eval:chat` |
