# Phase 2 — Growth

**Parent:** [00-MASTER-ARCHITECTURE.md](../00-MASTER-ARCHITECTURE.md)  
**Duration:** 6–8 weeks (after MVP)  
**Goal:** Full Meta channel coverage, monetization, richer knowledge ingestion, and analytics.

---

## 1. Phase objectives

| # | Objective | Success criteria |
|---|-----------|------------------|
| 1 | Messenger + Instagram DMs live | All 3 Meta channels per merchant |
| 2 | Stripe billing active | Paid subscriptions processing |
| 3 | Conversation ingest works | Upload export → bot uses Q&A patterns |
| 4 | Bedrock fallback production-ready | Auto-failover on OpenAI outage |
| 5 | Analytics dashboard | Merchants see conversion funnel |
| 6 | 50 paying merchants | Revenue target |

---

## 2. Scope additions

| Function | Phase 2 additions |
|----------|-------------------|
| [02 Meta Channels](../functions/02-meta-channel-integration.md) | Messenger + Instagram; template management UI |
| [04 LLM Router](../functions/04-llm-provider-router.md) | Intent-based routing; Bedrock fallback live |
| [05 RAG Ingestion](../functions/05-rag-knowledge-ingestion.md) | Conversation upload; social manual upload; weekly re-crawl |
| [08 Admin Dashboard](../functions/08-admin-dashboard.md) | Analytics charts; notification center |
| [09 Billing](../functions/09-billing-usage.md) | Full Stripe integration; quota enforcement |
| [10 Security](../functions/10-security-compliance.md) | DPA template; Comprehend PII; message TTL |
| [06 E-commerce Tools](../functions/06-ecommerce-tools.md) | WhatsApp interactive lists; Messenger cards |
| [13 Custom Auth](../functions/13-custom-auth.md) | **MFA:** TOTP + email OTP; optional per user |
| [12 Notifications](../functions/12-notifications-email-sms.md) | MFA email OTP; quota/billing emails |

### Still excluded

- Shopify/WooCommerce connectors
- Human agent handoff
- Enterprise KMS per tenant
- Multimodal (image) understanding

---

## 3. Deliverables

| Deliverable | Week |
|-------------|------|
| Messenger webhook + send | 1–2 |
| Instagram webhook + send | 2–3 |
| Messaging policy service (24h window) | 3 |
| Stripe Checkout + webhooks | 3–4 |
| Usage metering + quota blocks | 4 |
| Conversation ingest pipeline | 4–5 |
| Intent-based LLM routing | 5 |
| Bedrock fallback adapter (production) | 5 |
| Analytics API + dashboard charts | 6 |
| WhatsApp interactive product lists | 6–7 |
| Meta App Review (Messenger + IG permissions) | 7 |
| MFA TOTP + email OTP enrollment in admin | 6 |
| Quota + billing notification emails | 4 |
| Marketing site + self-serve signup | 7–8 |

---

## 4. LLM configuration (Phase 2)

| Intent | Primary | Fallback |
|--------|---------|----------|
| FAQ | gpt-4.1-nano | nova-micro |
| Product | gpt-4o-mini | claude-3-haiku |
| Checkout | gpt-4.1-mini | claude-3-5-haiku |

---

## 5. Billing launch

| Plan | Launch price |
|------|--------------|
| Starter | $49/mo |
| Pro | $149/mo |
| Business | $399/mo |

- 14-day free trial via Stripe
- MVP pilot merchants grandfathered 3 months Pro free

---

## 6. Meta App Review (Phase 2)

Additional permissions:

| Permission | Channel |
|------------|---------|
| `pages_messaging` | Messenger |
| `instagram_manage_messages` | Instagram |

---

## 7. Analytics events

| Event | Tracked from |
|-------|--------------|
| `conversation_started` | Orchestrator |
| `product_searched` | Tool executor |
| `cart_updated` | Tool executor |
| `checkout_link_sent` | Orchestrator |
| `order_confirmed` | Webhook (manual entry MVP) |

### Funnel

```
Conversations → Product searches → Cart adds → Checkout links → Orders
```

---

## 8. Infrastructure additions

| Service | Purpose |
|---------|---------|
| DynamoDB Streams | Analytics event processor |
| EventBridge | Scheduled reports |
| X-Ray | Distributed tracing |
| Resend templates | Quota, billing, mfa-email-otp |
| MFA settings UI | Security page in admin |

---

## 9. Risks

| Risk | Mitigation |
|------|------------|
| Instagram API limitations | Document feature gaps in admin |
| Stripe integration bugs | Test mode exhaustive testing |
| Conversation PII leak | Comprehend PII + legal review |
| Cost spike from Bedrock fallback | Monitor; alert on fallback rate > 10% |

---

## 10. Definition of done

1. Merchant can connect all 3 Meta channels + widget
2. Stripe processes payments; quota enforcement works
3. Conversation upload improves bot tone (merchant-reported)
4. Analytics dashboard shows funnel data
5. 50 active paying merchants
6. Platform gross margin > 60% (revenue minus LLM + AWS COGS)

---

## 11. Metrics targets

| Metric | Target |
|--------|--------|
| Monthly recurring revenue | $5,000+ |
| Churn | < 8% monthly |
| Avg messages/merchant | 500+/month |
| Checkout link conversion | > 3% of conversations |
| NPS (pilots) | > 40 |
