# Function Spec: Chat Orchestration

**Parent:** [00-MASTER-ARCHITECTURE.md](../00-MASTER-ARCHITECTURE.md)  
**Version:** 1.2  
**Implementation:** `packages/core/src/chat/orchestrator.ts`  
**Related:** [07-chat-quality-roadmap.md](../implementation/07-chat-quality-roadmap.md) (funnel, sub-intents, CTAs)

---

## 1. Purpose

Process every inbound customer message end-to-end: session management, intent detection, RAG retrieval, LLM invocation, tool execution, and outbound reply — channel-agnostic.

---

## 2. Position in pipeline

### Target (SQS-driven)

```mermaid
flowchart LR
  SQS_IN[SQS inbound] --> ORCH[chat-orchestrator]
  ORCH --> RAG[RAG retrieve]
  ORCH --> LLM[LLM provider]
  ORCH --> TOOLS[Commerce tools]
  ORCH --> SQS_OUT[SQS outbound]
  SQS_OUT --> SEND[Channel senders]
```

### Shipped (sync Lambda, same core library)

```mermaid
flowchart TB
  subgraph entry [Entry handlers]
    WH[webhook-meta]
    WIDGET[widget chat / stream]
    CHAT[chat-api]
    ONB[onboarding test-chat]
  end

  ORCH[runChatOrchestrator]
  WH & WIDGET & CHAT & ONB --> ORCH
  ORCH --> META[Meta Graph send]
  ORCH --> SSE[SSE to widget]
  ORCH --> JSON[JSON reply]
```

| Caller | File |
|--------|------|
| Web widget | `packages/core/src/widget/service.ts` |
| Admin test chat | `packages/core/src/chat/service.ts` |
| WhatsApp | `packages/core/src/meta/process-inbound.ts` |
| Messenger | `packages/core/src/meta/process-messenger-inbound.ts` |
| Instagram | `packages/core/src/meta/process-instagram-inbound.ts` |

---

## 3. Orchestrator algorithm

```mermaid
flowchart TD
  A[Inbound message] --> B{Channel enabled?}
  B -->|no| X[Reject]
  B --> C[reserveMessageQuota]
  C --> D[Load tenant config + conversation history]
  D --> E[detectIntent + detectSubIntent]
  E --> E2[resolveFunnelContext + qualification]
  E2 --> F[Persist inbound MSG]
  F --> G[retrieveForIntent RAG]
  G --> H[buildSystemPrompt + load cart]
  H --> I[createLLMProvider]
  I --> J{LLM available?}
  J -->|yes| K[Select model by intent]
  K --> L[LLM chat loop max 3 rounds]
  L --> M{tool_calls?}
  M -->|yes| N[executeTool]
  N --> L
  M -->|no| O[replyContent]
  J -->|no| P[fallback search_products + template reply]
  O --> Q[Persist outbound + incrementUsage]
  P --> Q
  Q --> R[ChatResult]
```

Numbered steps (spec):

```
1.  Validate message; check channel + quota
2.  Load tenant config (DynamoDB CONFIG + PROFILE)
3.  Check tenant status (active/trial only) — assertTenantOperational
4.  reserveMessageQuota (atomic; 80% warning email after success)
5.  Resolve conversationId from externalUserId + channel
6.  Persist inbound message to DynamoDB
7.  Load conversation history + cart
8.  Detect intent (faq | product | checkout | greeting | unknown)
9.  Detect sub-intent (browse, compare, detail, objection_*, etc.)
10. Resolve funnel stage (discover → compare → objection → cart → checkout)
11. Update qualification slots (budget, category, recipient, objections)
12. Retrieve RAG context (filtered by intent + source_type; objection FAQ tag boost)
13. Build LLM messages array (system + history + user + funnel hints)
14. Call OpenAI via createLLMProvider (model per intent from tenant llmConfig)
15. If tool_calls → execute tools → loop (max 3 rounds)
16. Build suggestedActions (CTAs) for web channel
17. Fallback reply if no LLM or empty response
18. Persist outbound message(s) to DynamoDB (with funnelStage, subIntent)
19. Increment usage counters (messages, tokens)
20. Return reply to channel handler (Meta send / widget SSE / JSON)
```

---

## 4. Conversation model

### DynamoDB

| PK | SK | Attributes |
|----|-----|------------|
| `TENANT#<id>` | `CONV#<channel>#<externalUserId>` | conversationId, cartId, funnelStage, qualification, lastInboundAt, lastOutboundAt, status |
| `TENANT#<id>` | `MSG#<conversationId>#<timestamp>` | role, content, channel, tokenCount |

### Conversation state object

```json
{
  "conversationId": "conv_abc",
  "tenantId": "ten_123",
  "channel": "whatsapp",
  "externalUserId": "919876543210",
  "cartId": "cart_xyz",
  "funnelStage": "discover",
  "qualification": {
    "budget": "under_50",
    "category": "sneakers",
    "recipient": null,
    "objections": []
  },
  "status": "active",
  "lastInboundAt": "2026-06-06T12:00:00Z",
  "messageCount": 14,
  "metadata": {
    "customerName": "Priya",
    "locale": "en"
  }
}
```

---

## 5. Intent detection

### MVP approach

Rule-based classifier first (fast, no extra LLM cost):

| Signal | Intent |
|--------|--------|
| Keywords: ship, return, refund, policy, hours | `faq` |
| Keywords: buy, price, size, color, recommend, product | `product` |
| Keywords: cart, checkout, order, pay, purchase | `checkout` |
| First message in session | `greeting` |
| Default | `product` |

### Phase 2+ (shipped)

Sub-intents refine product/checkout turns (`packages/core/src/chat/intent.ts`):

| Sub-intent | Typical signals |
|------------|-----------------|
| `product_browse` | open-ended search, gifts, recommendations |
| `product_compare` | vs, difference, which is better |
| `product_detail` | specific SKU, specs, sizing |
| `objection_price` / `objection_shipping` / … | cost, delivery, returns concerns |

Funnel stage (`packages/core/src/chat/funnel.ts`) advances from conversation + cart state:

| Stage | Meaning |
|-------|---------|
| `discover` | browsing, qualifying |
| `compare` | comparing options |
| `objection` | handling concerns |
| `cart` | items in cart |
| `checkout` | checkout link / order status |

### Future

Lightweight LLM classifier (GPT-4.1 nano) when rules confidence < 0.6.

---

## 6. Context assembly

### History window

| Setting | Default | Max |
|---------|---------|-----|
| Messages in context | Last 10 turns | 20 |
| Max history tokens | 2000 | 4000 |

### RAG injection

```
[System prompt + store config]
[Retrieved chunks — max 5, ~500 tokens each]
[Conversation history]
[Current user message]
```

### Source priority by intent

| Intent | Primary sources | Fallback |
|--------|-----------------|----------|
| `faq` | website | conversation |
| `product` | catalog, website | social |
| `checkout` | catalog | website (shipping) |
| `greeting` | — (use prompts only) | — |

---

## 7. Tool execution loop

```mermaid
flowchart LR
  INTENT[intent] --> TOOLS[toolsForIntent]
  TOOLS --> LLM[OpenAI chat]
  LLM -->|tool_calls| EXEC[executeTool]
  EXEC --> CATALOG[search_products / compare / related / cart / checkout]
  EXEC --> ORDERS[get_order_status]
  EXEC --> LLM
```

| Rule | Value |
|------|-------|
| Max tool rounds per message | 3 |
| Timeout per tool | 5s (implicit via Lambda) |
| Parallel tool calls | Sequential in loop (LLM may request multiple per round) |

**Code:** `packages/core/src/chat/tools.ts` — `TOOL_DEFINITIONS`, `toolsForIntent()`, `executeTool()`.

### Available tools

See [06-ecommerce-tools.md](06-ecommerce-tools.md) for full specs.

| Tool | When exposed |
|------|--------------|
| `search_products` | intent = product, checkout |
| `get_product_details` | intent = product, checkout |
| `compare_products` | sub-intent = product_compare |
| `get_related_products` | intent = product (post-search / upsell) |
| `add_to_cart` | intent = product, checkout |
| `get_cart` | intent = checkout |
| `create_checkout_link` | intent = checkout |
| `get_order_status` | intent = checkout, faq |

---

## 8. Response formatting

### Social channels

- Plain text primary
- Optional: WhatsApp interactive list (product options)
- Optional: quick replies (Messenger)
- No markdown (strip `**`, `#`, links → plain URL)

### Web channel

- Markdown supported
- Product cards (JSON → widget renders)
- `suggestedActions` with `action`: `view` | `add_to_cart` | `checkout`
- Widget `add_to_cart` calls `POST /api/v1/widget/cart` directly (no chat round-trip)
- Streaming via SSE

### Response splitter

```typescript
function splitForChannel(text: string, channel: Channel): string[] {
  const limits = { whatsapp: 4096, messenger: 2000, instagram: 1000, web: 16000 };
  // Split on paragraph boundaries; never mid-word
}
```

---

## 9. System prompt template

```
You are {{storeName}}'s AI shopping assistant.

Rules:
- Answer using ONLY the provided context and tool results
- For shipping, returns, and policies: prefer website sources
- Be friendly and match the brand tone in social/conversation examples
- When recommending products, use search_products tool — do not invent SKUs
- Confirm before adding to cart
- If unsure, ask a clarifying question
- Never share other customers' information

Context:
{{ragChunks}}

Current cart: {{cartSummary}}
```

---

## 10. Latency budget

| Step | Target p95 |
|------|------------|
| Load session + config | 50ms |
| RAG retrieval | 200ms |
| LLM call (1 round) | 3000ms |
| Tool execution | 500ms |
| Persist + enqueue | 100ms |
| **Total** | **< 5000ms** (social) |

---

## 11. Lambda specification

| Property | Value |
|----------|-------|
| Name | `chat-orchestrator` |
| Trigger | SQS `inbound-messages` |
| Memory | 1024 MB |
| Timeout | 60s |
| Concurrency | Reserved: 50 (scale per load) |
| Batch size | 1 (ordering per conversation) |

**FIFO consideration:** Use `MessageGroupId = tenantId#conversationId` on SQS FIFO queue to preserve message order per conversation.

---

## 12. Failure modes

| Failure | Behavior |
|---------|----------|
| LLM timeout | Retry once on fallback provider; then apology message |
| RAG empty | Proceed with tools + system prompt; log warning |
| Tool failure | LLM receives error; responds gracefully |
| Quota exceeded | "We've reached our message limit. Please contact the store directly." |
| Tenant suspended | No orchestration (filtered at webhook) |

---

## 13. Observability

### Structured log fields

```json
{
  "tenantId": "ten_123",
  "conversationId": "conv_abc",
  "channel": "whatsapp",
  "intent": "product",
  "subIntent": "product_browse",
  "funnelStage": "discover",
  "llmProvider": "openai",
  "llmModel": "gpt-4o-mini",
  "inputTokens": 2100,
  "outputTokens": 280,
  "ragChunkCount": 4,
  "toolCalls": ["search_products"],
  "latencyMs": 4200
}
```

### Metrics (CloudWatch)

- `MessagesProcessed` per tenant, channel
- `OrchestratorLatency` p50/p95/p99
- `LLMErrorRate` per provider
- `ToolFailureRate` per tool name

---

## 14. APIs (internal)

Orchestrator core is **`runChatOrchestrator()`** in `packages/core/src/chat/orchestrator.ts`. Invoked synchronously from channel handlers today.

| Lambda | Path | Mode |
|--------|------|------|
| `chat-api` | `POST /api/v1/chat` | Sync JSON |
| `widget` | `POST /api/v1/widget/chat` | Sync JSON |
| `widget` | `POST /api/v1/widget/chat/stream` | Sync + SSE events |
| `webhook-meta` | `POST /webhooks/meta` | Sync; orchestrate + Meta Graph send |
| `onboarding` | `POST /api/v1/onboarding/test-chat` | Sync test simulator |

---

## 15. Testing checklist

- [ ] New conversation created on first message
- [ ] History persists across messages
- [ ] Intent routing selects correct LLM model
- [ ] RAG chunks match intent source filters
- [ ] Tool loop terminates at 3 rounds
- [ ] Outbound message enqueued with correct channel format
- [ ] Quota enforcement blocks over-limit tenants
- [ ] Fallback LLM used when primary fails
- [ ] Message order preserved per conversation (FIFO)
