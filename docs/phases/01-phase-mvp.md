# Phase 1 — MVP

**Parent:** [00-MASTER-ARCHITECTURE.md](../00-MASTER-ARCHITECTURE.md)  
**Duration:** 8–10 weeks  
**Goal:** First shippable product — one merchant can connect WhatsApp, ingest website + products, and convert chats to checkout links.  
**Progress (2026-06-07):** Local dev has auth, tenant, onboarding, knowledge ingest, chat orchestrator, usage, conversations, dashboard stats, and widget embed (**35 real routes**). See [implementation/06-api-implementation-status.md](../implementation/06-api-implementation-status.md).

---

## 1. Phase objectives

| # | Objective | Success criteria |
|---|-----------|------------------|
| 1 | Merchant can sign up and configure a store | Onboarding wizard completes |
| 2 | WhatsApp channel works end-to-end | Inbound message → AI reply on WhatsApp |
| 3 | Web widget works on merchant site | Embed script → sync chat *(SSE streaming Phase 2)* |
| 4 | Bot answers from website + product catalog | recall@5 ≥ 80% on eval set |
| 5 | Bot can search products and share checkout link | Test purchase flow completes |
| 6 | Admin can view conversations | Conversation list + thread view |

---

## 2. Scope

### Included

| Function | MVP scope |
|----------|-----------|
| [01 SaaS Tenant](../functions/01-saas-tenant-platform.md) | Signup, tenant config, isolation |
| [13 Custom Auth](../functions/13-custom-auth.md) | DynamoDB users, JWT, login — **MFA off** |
| [02 Meta Channels](../functions/02-meta-channel-integration.md) | **WhatsApp only** |
| [03 Chat Orchestration](../functions/03-chat-orchestration.md) | Full pipeline |
| [04 LLM Router](../functions/04-llm-provider-router.md) | OpenAI only (Bedrock stub) |
| [05 RAG Ingestion](../functions/05-rag-knowledge-ingestion.md) | Website + CSV catalog + manual FAQ |
| [06 E-commerce Tools](../functions/06-ecommerce-tools.md) | Manual connector only |
| [07 Web Widget](../functions/07-web-chat-widget.md) | Full widget |
| [08 Admin Dashboard](../functions/08-admin-dashboard.md) | Onboarding, config, conversations, simulator |
| [09 Billing](../functions/09-billing-usage.md) | **Deferred** — free trial only, no Stripe |
| [10 Security](../functions/10-security-compliance.md) | Core controls |
| [11 AWS Infra](../functions/11-aws-infrastructure.md) | Dev + staging + prod |
| [12 Notifications](../functions/12-notifications-email-sms.md) | Resend auth + platform emails; `EmailProvider` abstraction |

### Excluded (later phases)

- Messenger and Instagram
- Conversation/social ingest
- Stripe billing
- Shopify connector
- Analytics charts
- Human handoff
- Bedrock production fallback
- MFA (TOTP / email OTP / SMS)

---

## 3. Deliverables

| Deliverable | Owner | Week |
|-------------|-------|------|
| AWS CDK skeleton + CI/CD | Infra | 1 |
| Tenant platform + custom auth (JWT) | Backend | 2 |
| Meta webhook + WhatsApp send | Backend | 3 |
| Ingest pipeline (website + CSV) | Backend | 4 |
| Chat orchestrator + OpenAI | Backend | 5 |
| E-commerce tools (manual) | Backend | 5 |
| Web widget + chat API | Frontend | 6 |
| Admin dashboard (core pages) | Frontend | 7 |
| End-to-end integration testing | QA | 8 |
| Meta App Review submission | Product | 8 |
| Resend + SES domain setup (SPF/DKIM) | Infra | 2 |
| `EmailProvider` abstraction + Resend adapter | Backend | 3 |
| Staging pilot with 3 merchants | Product | 9–10 |

---

## 4. Technical milestones

### Week 1–2: Foundation

```
✓ CDK deploys API GW, DynamoDB, S3, SQS
✓ Auth signup/login API works
✓ JWT authorizer on admin routes
✓ Login from admin app (Jetwing-style)
```

### Week 3–4: Channels + Ingest

```
✓ Knowledge source CRUD + website crawl + catalog CSV ingest (local `FileVectorStore`)
○ Meta webhook receives WhatsApp messages
○ Tenant resolved from phone_number_id
○ S3 Vectors in production (local file-backed vectors today)
```

### Week 5–6: AI core

```
✓ Orchestrator processes SQS messages
✓ RAG retrieval with source filters
✓ OpenAI GPT-4o mini + tools
✓ Cart + checkout link generation
✓ Outbound WhatsApp send
```

### Week 7–8: UI + polish

```
✓ Web widget embeddable (`v1.js`, shadow DOM, formatted replies, action chips)
✓ Admin onboarding wizard
✓ Conversation viewer
✓ Test simulator with debug panel
✓ Dashboard live stats (`GET /dashboard/stats`)
○ Meta / WhatsApp E2E
```

### Week 9–10: Launch prep

```
✓ Meta App Review approved
✓ Security checklist complete
✓ 3 pilot merchants onboarded
✓ Documentation for merchants
```

---

## 5. MVP architecture (simplified)

```
WhatsApp + Web Widget
        ↓
   API Gateway
        ↓
  Webhook / Chat API
        ↓
   SQS → Orchestrator → OpenAI
        ↓
  S3 Vectors + DynamoDB
```

---

## 6. LLM configuration (MVP)

| Intent | Model |
|--------|-------|
| All | `gpt-4o-mini` (single model for simplicity) |
| Embeddings | `text-embedding-3-small` |
| Fallback | None (retry OpenAI 2× only) |

Simplify routing in MVP; add intent-based routing in Phase 2.

---

## 7. Meta setup (MVP)

| Item | Detail |
|------|--------|
| Channels | WhatsApp Cloud API only |
| Test | Meta test WABA + test phone numbers |
| App Review | `whatsapp_business_messaging` permission |
| Webhook URL | `https://api-staging.commercechat.com/webhooks/meta` |

---

## 8. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Meta App Review delay | Submit week 6; use test numbers for pilot |
| RAG quality poor | Manual FAQ editor + eval set from day 1 |
| WhatsApp template confusion | Document 24h window clearly in admin |
| Scope creep | Messenger/IG explicitly deferred |

---

## 9. MVP testing plan

| Test | Pass criteria |
|------|---------------|
| Signup → onboarding | < 15 min to first test reply |
| WhatsApp round-trip | Reply within 8s |
| Website ingest | 50-page site indexes in < 5 min |
| Product search | Correct SKU in top 3 results |
| Checkout link | Valid URL with cart contents |
| Widget embed | Works on external HTML page |
| Tenant isolation | Pen test: zero cross-tenant access |

---

## 10. Definition of done

Phase 1 is complete when:

1. Three pilot merchants use WhatsApp + widget in production
2. At least one pilot merchant receives a checkout link from a real customer conversation
3. Meta App Review approved for WhatsApp messaging
4. No P0 bugs open for 7 days
5. All MVP testing plan items pass

---

## 11. Team allocation (suggested)

| Role | FTE | Focus |
|------|-----|-------|
| Backend engineer | 1.0 | Orchestrator, Meta, ingest |
| Frontend engineer | 0.75 | Admin + widget |
| Infra/DevOps | 0.25 | CDK, CI/CD |
| Product/QA | 0.5 | Pilots, Meta review, testing |
