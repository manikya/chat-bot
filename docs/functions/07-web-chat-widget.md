# Function Spec: Web Chat Widget

**Parent:** [00-MASTER-ARCHITECTURE.md](../00-MASTER-ARCHITECTURE.md)  
**Version:** 1.0

---

## 1. Purpose

Provide an embeddable JavaScript chat widget merchants add to their storefront, sharing the same AI orchestrator and tools as social channels.

### Implementation status (2026-06-14)

| Spec | Shipped | Notes |
|------|---------|-------|
| Embed script | `apps/widget/public/v1.js` | Served at `GET /widget/v1.js`; `API_PUBLIC_URL` in embed snippet |
| UI framework | Vanilla JS + shadow DOM | Spec calls for React/Preact bundle + loader — deferred |
| Chat API | `POST /api/v1/widget/chat` (sync) + `/chat/stream` (SSE) | Typing events, token streaming |
| Auth | `X-API-Key: pk_live_...` | Same orchestrator as admin test chat |
| Config | `GET /api/v1/widget/config` | Greeting, colors, `suggestedQuestions` |
| Bot formatting | `formatBotText()` | `**bold**`, lists, `\n` → `<br>` |
| Product UI | Carousel cards (up to 5) | Multi-image dots; `search_products` tool |
| Rate limits | Per-plan | `WIDGET_CHAT_RATE_LIMITS` / config limits in `billing/plans.ts` |
| CDN | CloudFront (`npm run deploy:widget`) | Dev: `https://dtm79sin0m5bg.cloudfront.net/widget/v1.js` |
| Demo | `http://localhost:3001/widget/demo.html?key=...` | Must use HTTP (CORS blocks `file://`) |

---

## 2. Embed method

Merchants add one script tag to their site:

```html
<script
  src="https://cdn.commercechat.com/widget/v1/loader.js"
  data-tenant-key="pk_live_abc123"
  data-position="bottom-right"
  data-primary-color="#4F46E5"
  async
></script>
```

### Loader responsibilities

1. Validate `data-tenant-key` format
2. Fetch widget config from CDN/API (cached 1h)
3. Lazy-load main widget bundle (code-split)
4. Inject iframe or shadow DOM bubble (isolation from host CSS)

---

## 3. Widget architecture

```
loader.js (2KB)
  └── widget.bundle.js (React or Preact)
        ├── ChatBubble (minimized)
        ├── ChatWindow (expanded)
        ├── MessageList
        ├── InputBar
        ├── ProductCard (rich message type)
        └── SSE client
```

Hosted on **S3 + CloudFront** (`cdn.commercechat.com`).

---

## 4. Chat API

### Endpoint

```
POST /api/v1/chat
Authorization: Bearer <tenant-public-key>
Content-Type: application/json
Accept: text/event-stream
```

### Request

```json
{
  "sessionId": "sess_xyz",
  "message": "Do you have blue sneakers in size 9?",
  "metadata": {
    "pageUrl": "https://store.com/products",
    "userAgent": "..."
  }
}
```

### Response (SSE stream)

```
event: token
data: {"text": "Let me "}

event: token
data: {"text": "check our "}

event: product_card
data: {"sku": "SHOE-BLU-9", "name": "Blue Runner", "price": 89.99, "imageUrl": "..."}

event: done
data: {"messageId": "msg_123", "usage": {"tokens": 450}}
```

---

## 5. Session management

| Item | Spec |
|------|------|
| Session ID | Client-generated UUID in `localStorage` |
| Persistence | `localStorage['cc_session_<tenantKey>']` |
| Expiry | 24h inactivity → new session |
| Conversation link | `sessionId` maps to `conversationId` in DynamoDB |

Unlike social channels, web sessions are anonymous unless merchant passes `data-customer-id` (optional).

---

## 6. Differences from social orchestration

| Feature | Web | Social |
|---------|-----|--------|
| Streaming | SSE enabled | Disabled (full response) |
| Rich cards | Product cards, buttons | Plain text / channel templates |
| Markdown | Supported | Stripped |
| Latency target | < 4s p95 | < 8s p95 |
| Sync API | Direct Lambda invoke | SQS async |

**Shared:** Same orchestrator library, tools, RAG, LLM router.

---

## 7. Widget configuration (per tenant)

Fetched from `GET /api/v1/widget/config?key=pk_live_abc`:

```json
{
  "storeName": "Acme Shoes",
  "greeting": "Hi! How can I help you shop today?",
  "primaryColor": "#4F46E5",
  "position": "bottom-right",
  "avatarUrl": "https://cdn.../avatar.png",
  "suggestedQuestions": [
    "What are your best sellers?",
    "Shipping info",
    "Return policy"
  ],
  "enabled": true
}
```

---

## 8. Security

| Threat | Mitigation |
|--------|------------|
| API key abuse | Rate limit per key: 60 req/min; WAF |
| XSS from host page | Shadow DOM / iframe isolation |
| CSRF | Public key auth only on chat endpoint; no cookies |
| Key extraction | Key is public-by-design; rate limits + domain allowlist (Pro) |

### Domain allowlist (Pro plan)

```json
{
  "allowedDomains": ["store.com", "www.store.com"]
}
```

Validate `Origin` header against allowlist.

---

## 9. UI specification

### Chat bubble

- 60×60px circle, bottom-right default
- Unread badge count
- Pulse animation on first visit (optional)

### Chat window

- 380×600px desktop; full-screen mobile
- Header: store name + close button
- Message area: scrollable, auto-scroll on new messages
- Input: text field + send button; Enter to send
- Suggested questions shown on empty state

### Product card component

```
┌─────────────────────────┐
│ [image]  Blue Runner     │
│          $89.99          │
│  [Add to Cart] [Details] │
└─────────────────────────┘
```

Button clicks send structured message to API:
```json
{ "action": "add_to_cart", "sku": "SHOE-BLU-9" }
```

---

## 10. CDN deployment

| Asset | Cache |
|-------|-------|
| `loader.js` | 1 hour |
| `widget.bundle.js` | 24 hours (versioned filename) |
| Widget config API | 5 minutes |

Versioned URLs: `widget/v1.2.3/bundle.js` for cache busting.

---

## 11. Lambda functions

| Function | Trigger | Responsibility |
|----------|---------|----------------|
| `chat-api` | API Gateway POST | Sync orchestrator + SSE |
| `widget-config` | API Gateway GET | Return tenant widget config |

---

## 12. Analytics events (client)

| Event | Payload |
|-------|---------|
| `widget_opened` | tenantKey, sessionId |
| `message_sent` | sessionId, length |
| `product_card_clicked` | sku |
| `checkout_clicked` | cartId |

Sent to `POST /api/v1/analytics/events` (batched, fire-and-forget).

---

## 13. Testing checklist

- [x] Embed script loads on third-party HTML page (local demo)
- [x] Shadow DOM isolates styles from host
- [ ] SSE streaming renders tokens incrementally
- [~] Product action chips render when API returns `suggestedActions`
- [ ] Rich product cards (image + add-to-cart) render in message list
- [x] Session persists on page reload (`localStorage`)
- [ ] Rate limit triggers gracefully
- [ ] Domain allowlist blocks unauthorized origins
- [ ] Mobile responsive full-screen mode
- [~] Same cart/tools behavior as admin test chat (tools work; WhatsApp path not live)
