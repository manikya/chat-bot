# Function Spec: Chat Orchestration

**Parent:** [00-MASTER-ARCHITECTURE.md](../00-MASTER-ARCHITECTURE.md)  
**Version:** 1.0

---

## 1. Purpose

Process every inbound customer message end-to-end: session management, intent detection, RAG retrieval, LLM invocation, tool execution, and outbound reply enqueue — channel-agnostic.

---

## 2. Position in pipeline

```
SQS (inbound) → chat-orchestrator → [RAG, LLM Router, Tools] → SQS (outbound)
```

---

## 3. Orchestrator algorithm

```
1.  Parse SQS record → UnifiedMessage
2.  Load tenant config (cache 5 min)
3.  Check tenant status (active/trial only)
4.  Check plan message quota → reject with notice if exceeded
5.  Resolve conversationId from externalUserId + channel
6.  Persist inbound message to DynamoDB
7.  Load conversation state (history, cart, metadata)
8.  Evaluate messaging policy (24h window — delegate to channel policy)
9.  Detect intent (faq | product | checkout | greeting | unknown)
10. Retrieve RAG context (filtered by intent + source_type)
11. Build LLM messages array (system + history + user + tool results)
12. Call LLM router (streaming off for social; on for web)
13. If tool_calls → execute tools → loop (max 3 rounds)
14. Persist outbound message(s) to DynamoDB
15. Increment usage counters
16. Enqueue outbound SQS message(s)
17. Emit analytics event (EventBridge)
```

---

## 4. Conversation model

### DynamoDB

| PK | SK | Attributes |
|----|-----|------------|
| `TENANT#<id>` | `CONV#<channel>#<externalUserId>` | conversationId, cartId, lastInboundAt, lastOutboundAt, status |
| `TENANT#<id>` | `MSG#<conversationId>#<timestamp>` | role, content, channel, tokenCount |

### Conversation state object

```json
{
  "conversationId": "conv_abc",
  "tenantId": "ten_123",
  "channel": "whatsapp",
  "externalUserId": "919876543210",
  "cartId": "cart_xyz",
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

### Phase 2

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

| Rule | Value |
|------|-------|
| Max tool rounds per message | 3 |
| Timeout per tool | 5s |
| Parallel tool calls | Yes (when LLM requests multiple) |

### Available tools

See [06-ecommerce-tools.md](06-ecommerce-tools.md) for full specs.

| Tool | When exposed |
|------|--------------|
| `search_products` | intent = product, checkout |
| `get_product_details` | intent = product, checkout |
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

Orchestrator is SQS-driven only. Web chat uses `chat-api` Lambda that invokes same core library synchronously with SSE.

| Lambda | Path | Mode |
|--------|------|------|
| `chat-api` | POST `/api/v1/chat` | Sync + SSE (web widget) |

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
