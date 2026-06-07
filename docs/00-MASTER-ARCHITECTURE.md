# CommerceChat SaaS — Master Architecture Document

**Product:** Multi-tenant AI chatbot for e-commerce stores  
**Version:** 1.0  
**Last updated:** 2026-06-07  
**Status:** Design specification + **local implementation in progress** (25 real API routes; see [implementation/06-api-implementation-status.md](implementation/06-api-implementation-status.md))

---

## 1. Executive summary

CommerceChat is a **B2B SaaS platform** that lets e-commerce merchants deploy an AI sales assistant across **WhatsApp**, **Facebook Messenger**, **Instagram DMs**, and a **web chat widget**. The bot answers customer questions using the merchant's website, social content, and uploaded conversation history, and converts inquiries into orders via integrated commerce tools.

The platform runs on **AWS serverless**, uses a **switchable LLM layer** (OpenAI primary, Amazon Bedrock fallback), and indexes knowledge with **OpenAI text-embedding-3-small** stored in **Amazon S3 Vectors** per tenant.

---

## 2. Goals and non-goals

### Goals

- Multi-tenant SaaS with isolated data per merchant
- Unified AI brain across WhatsApp, Messenger, Instagram, and web
- Knowledge ingestion from website, social sources, and conversation exports
- E-commerce actions: product search, cart, checkout link, order status
- Switchable LLM providers without rewriting business logic
- AWS serverless deployment (Lambda, API Gateway, DynamoDB, SQS, Step Functions)
- Usage-based billing via Stripe

### Non-goals (v1)

- Unrestricted scraping of social platforms
- Native in-chat payment processing (checkout links / WhatsApp catalog instead)
- On-premise deployment
- Human agent live-chat console (Phase 3)
- Mobile apps for merchants

---

## 3. Document index

### Function specifications

| Doc | Title | Description |
|-----|-------|-------------|
| [01](functions/01-saas-tenant-platform.md) | SaaS Tenant Platform | Multi-tenancy, auth, tenant config, data isolation |
| [02](functions/02-meta-channel-integration.md) | Meta Channel Integration | WhatsApp, Messenger, Instagram webhooks and sending |
| [03](functions/03-chat-orchestration.md) | Chat Orchestration | Message pipeline, sessions, conversation state |
| [04](functions/04-llm-provider-router.md) | LLM Provider Router | OpenAI / Bedrock abstraction, model routing |
| [05](functions/05-rag-knowledge-ingestion.md) | RAG & Knowledge Ingestion | Website, social, conversations, vector index |
| [06](functions/06-ecommerce-tools.md) | E-commerce Tools | Product search, cart, orders, connectors |
| [07](functions/07-web-chat-widget.md) | Web Chat Widget | Embeddable storefront widget |
| [08](functions/08-admin-dashboard.md) | Admin Dashboard | Merchant UI, onboarding, analytics |
| [09](functions/09-billing-usage.md) | Billing & Usage Metering | Stripe plans, quotas, overages |
| [10](functions/10-security-compliance.md) | Security & Compliance | PII, GDPR, Meta policies, secrets |
| [11](functions/11-aws-infrastructure.md) | AWS Infrastructure | Services, IAM, deployment, observability |
| [12](functions/12-notifications-email-sms.md) | Notifications (Email & SMS) | EmailProvider/SmsProvider, Resend |
| [13](functions/13-custom-auth.md) | Custom Authentication | DynamoDB users, JWT, MFA-ready (no Cognito) |

### Phase specifications

| Doc | Title | Description |
|-----|-------|-------------|
| [01](phases/01-phase-mvp.md) | Phase 1 — MVP | First shippable product (8–10 weeks) |
| [02](phases/02-phase-growth.md) | Phase 2 — Growth | Instagram, billing, ingestion expansion |
| [03](phases/03-phase-scale.md) | Phase 3 — Scale | Shopify, handoff, enterprise features |

### Implementation guides

| Doc | Title | Description |
|-----|-------|-------------|
| [01](implementation/01-database-design.md) | Database Design | DynamoDB schema, GSIs, TTL, access patterns |
| [02](implementation/02-api-specification.md) | API Specification | Endpoints with request/response documentation |
| [03](implementation/03-task-plan.md) | Task Plan | Sprint backlog with dependencies and milestones |
| [04](implementation/04-onboarding-and-registration.md) | Onboarding & Registration | Signup, email verify, shop wizard, team invites |
| [05](implementation/05-ui-inventory.md) | UI Inventory & Actions | Screens, UI elements, and merchant/shopper actions |

---

## 4. System context diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CommerceChat SaaS Platform                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  WhatsApp    │  │  Messenger   │  │  Instagram   │  │  Web Widget  │   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │
│         │                 │                 │                 │            │
│         └─────────────────┴────────┬────────┴─────────────────┘            │
│                                      ▼                                       │
│                         ┌────────────────────────┐                           │
│                         │   Meta Graph API       │                           │
│                         │   (Cloud API + Pages)  │                           │
│                         └───────────┬────────────┘                           │
│                                     │ webhooks                               │
│                                     ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ INGRESS: CloudFront → WAF → API Gateway → Webhook Receiver → SQS    │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                     │                                        │
│                                     ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ CORE: Channel Adapters → Chat Orchestrator → LLM Router → Tools      │   │
│  │       RAG Retrieval (S3 Vectors) ← Knowledge Ingestion Pipeline       │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                     │                                        │
│         ┌───────────────────────────┼───────────────────────────┐           │
│         ▼                           ▼                           ▼           │
│  ┌─────────────┐            ┌─────────────┐            ┌─────────────┐       │
│  │  DynamoDB   │            │  S3 / S3    │            │  OpenAI /   │       │
│  │  (tenants,  │            │  Vectors    │            │  Bedrock    │       │
│  │  sessions)  │            │  (knowledge)│            │  (LLM)      │       │
│  └─────────────┘            └─────────────┘            └─────────────┘       │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ SAAS: Custom Auth (DynamoDB+JWT) → Admin Dashboard → Stripe Billing    │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
         ▲                                    ▲
         │                                    │
   ┌─────┴─────┐                      ┌──────┴──────┐
   │ Merchants │                      │  Customers  │
   │  (Admin)  │                      │  (Shoppers) │
   └───────────┘                      └─────────────┘
```

---

## 5. Technology stack

| Layer | Primary choice | Fallback / alternative |
|-------|----------------|------------------------|
| Compute | AWS Lambda | — |
| API | API Gateway (HTTP) | — |
| Queue | SQS + DLQ | — |
| Workflow | Step Functions | — |
| Database | DynamoDB | — |
| Object storage | S3 | — |
| Vector store | S3 Vectors | Bedrock Knowledge Bases |
| Chat LLM | OpenAI GPT-4o mini | GPT-4.1 mini (checkout), Bedrock |
| Embeddings | OpenAI text-embedding-3-small | text-embedding-3-large (premium) |
| Merchant auth | DynamoDB + JWT (custom) | MFA TOTP/email Phase 2; SMS Phase 3 |
| Auth email | Resend via `EmailProvider` | SES fallback |
| Platform email | Resend via `EmailProvider` | SES fallback |
| SMS | Skipped MVP | Twilio via `SmsProvider` (Phase 3, optional) |
| Billing | Stripe | — |
| CDN / edge | CloudFront + WAF | — |
| Secrets | AWS Secrets Manager | SSM Parameter Store (non-secret config) |
| Channels | Meta Graph API | — |

---

## 6. Core architectural patterns

### 6.1 Multi-tenancy

- **Partition key:** `TENANT#<tenantId>` on all tenant-owned data
- **Webhook routing:** GSI lookup by `page_id`, `phone_number_id`, or `ig_user_id`
- **Vector isolation:** Separate S3 Vectors index namespace per tenant
- **Secrets:** Per-tenant Meta and commerce tokens in Secrets Manager

### 6.2 Channel adapter pattern

All channels normalize to a single `UnifiedMessage` contract before entering the orchestrator. Outbound messages are denormalized per channel format and policy (24-hour window, templates, character limits).

### 6.3 Async webhook processing

Meta webhooks must respond within seconds. The webhook Lambda validates, enqueues, and returns `200 OK`. All AI and send logic runs in SQS consumers.

### 6.4 Switchable LLM

Business logic calls `LLMProvider.chat()` via a router. Provider adapters translate requests/responses. Embeddings and vector store are **not** switchable without re-indexing.

### 6.5 Layered RAG

Retrieval uses metadata filters:

- `source_type=website` — policies, shipping, returns
- `source_type=conversation` — tone, common Q&A patterns
- `source_type=social` — brand voice, campaigns
- `source_type=catalog` — products

---

## 7. Data flow summary

### Inbound (customer message)

1. Customer sends message on WhatsApp / Messenger / Instagram / web
2. Meta (or widget) delivers to platform webhook / chat API
3. Webhook receiver validates signature, resolves `tenantId`, enqueues to SQS
4. Orchestrator loads session, checks messaging policy, retrieves RAG context
5. LLM router selects model by intent; tools execute commerce actions
6. Reply enqueued to outbound SQS
7. Channel sender delivers via Meta Graph API or SSE to widget

### Knowledge ingestion (merchant setup)

1. Merchant adds website URL, social links, or uploads conversation export
2. Ingest API creates job → Step Functions pipeline
3. Fetch/parse → PII scrub → chunk (source-specific) → embed → index in S3 Vectors
4. Job status visible in admin dashboard

---

## 8. Key constraints

| Constraint | Impact |
|------------|--------|
| Meta 24-hour messaging window | Free-form replies only inside session; templates required outside |
| Meta App Review | Required permissions before production messaging |
| Social platform ToS | No scraping; OAuth + uploads only for social content |
| WhatsApp template approval | Pre-approved templates for re-engagement messages |
| LLM context size | Cap history + RAG chunks to control cost and latency |
| Tenant isolation | Zero cross-tenant data leakage (critical for SaaS trust) |

---

## 9. Recommended model assignments

| Use case | Primary | Secondary |
|----------|---------|-----------|
| FAQ / greetings | GPT-4.1 nano | Bedrock Nova Micro |
| Product discovery | GPT-4o mini | — |
| Checkout / orders | GPT-4.1 mini | — |
| Embeddings | text-embedding-3-small | text-embedding-3-large |
| LLM failover | — | Amazon Bedrock (Claude Haiku) |

---

## 10. Success metrics

| Metric | Target (MVP) |
|--------|--------------|
| Webhook ACK latency | < 300ms p99 |
| End-to-end reply latency | < 8s p95 (social), < 4s p95 (web) |
| Retrieval recall@5 | > 80% on tenant eval set |
| Conversation → order conversion | Baseline + measurable uplift |
| Platform uptime | 99.5% |
| Cross-tenant data incidents | 0 |

---

## 11. Implementation order

See phase documents for full detail. Summary:

1. **Phase 1 (MVP):** Tenant platform, one Meta channel, orchestrator, RAG (website), web widget, basic admin
2. **Phase 2 (Growth):** All Meta channels, conversation ingest, Stripe billing, analytics
3. **Phase 3 (Scale):** Shopify, human handoff, enterprise isolation, auto-routing

---

## 12. Glossary

| Term | Definition |
|------|------------|
| **Tenant** | A merchant / store using the SaaS platform |
| **Channel** | WhatsApp, messenger, instagram, or web |
| **WABA** | WhatsApp Business Account |
| **PSID** | Page-Scoped ID (Messenger user identifier) |
| **RAG** | Retrieval-Augmented Generation |
| **OCU** | OpenSearch Compute Unit (avoid in v1; use S3 Vectors) |
| **UnifiedMessage** | Internal normalized message format across channels |

---

## 13. Change log

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-06-06 | Initial architecture and document index |
| 1.1 | 2026-06-06 | Added notifications strategy (doc 12): Resend + EmailProvider abstraction |
| 1.2 | 2026-06-06 | Replaced Cognito with custom DynamoDB auth + MFA-ready design (doc 13) |
| 1.3 | 2026-06-07 | Local MVP progress: auth session flows, onboarding APIs, knowledge CRUD (stub sync), timezone picker |
| 1.4 | 2026-06-07 | Chat orchestrator, usage/conversations/widget APIs, dashboard stats, `v1.js` embed with message formatting |
