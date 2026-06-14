# CommerceChat — Documentation

AI-powered e-commerce chatbot SaaS for **WhatsApp**, **Facebook Messenger**, **Instagram DMs**, and **web chat**.

---

## Start here

📄 **[Master Architecture Document](00-MASTER-ARCHITECTURE.md)** — system overview, stack, patterns, and document index.

🎨 **[Reference UI](../reference%20UI/README.md)** — cloned [jetwing-ai-itinerary](https://github.com/Capricon-Solutions/jetwing-ai-itinerary) for shadcn/Next.js patterns and components.

🖥️ **[Admin UI](../apps/admin/README.md)** — Next.js dashboard; **~75 real API routes** (auth, tenant, knowledge, chat, channels, billing, widget).

📡 **[API implementation status](implementation/06-api-implementation-status.md)** — built vs remaining + **what to build next** (last updated 2026-06-15).

🚀 **[AWS deploy guide](../infra/aws-serverless-deployment.md)** — `npm run deploy:aws:full` (IAM + ingest + widget CDN + crons).

🧩 **Widget (dev):** CDN `https://dtm79sin0m5bg.cloudfront.net/widget/v1.js` · local demo `http://localhost:3001/widget/demo.html?key=pk_live_...`

---

## Function specifications

Detailed specs for each platform function:


| #   | Document                                                               | Description                                |
| --- | ---------------------------------------------------------------------- | ------------------------------------------ |
| 01  | [SaaS Tenant Platform](functions/01-saas-tenant-platform.md)           | Multi-tenancy, auth, config                |
| 02  | [Meta Channel Integration](functions/02-meta-channel-integration.md)   | WhatsApp, Messenger, Instagram             |
| 03  | [Chat Orchestration](functions/03-chat-orchestration.md)               | Message pipeline, sessions                 |
| 04  | [LLM Provider Router](functions/04-llm-provider-router.md)             | OpenAI / Bedrock abstraction               |
| 05  | [RAG & Knowledge Ingestion](functions/05-rag-knowledge-ingestion.md)   | Website, social, conversations             |
| 06  | [E-commerce Tools](functions/06-ecommerce-tools.md)                    | Products, cart, checkout                   |
| 07  | [Web Chat Widget](functions/07-web-chat-widget.md)                     | Embeddable storefront widget               |
| 08  | [Admin Dashboard](functions/08-admin-dashboard.md)                     | Merchant UI                                |
| 09  | [Billing & Usage](functions/09-billing-usage.md)                       | Stripe, quotas                             |
| 10  | [Security & Compliance](functions/10-security-compliance.md)           | PII, GDPR, Meta policies                   |
| 11  | [AWS Infrastructure](functions/11-aws-infrastructure.md)               | Services, IAM, deployment                  |
| 12  | [Notifications (Email & SMS)](functions/12-notifications-email-sms.md) | Resend, Twilio (optional) |
| 13  | [Custom Authentication](functions/13-custom-auth.md)                   | DynamoDB + JWT, MFA-ready |


---

## Implementation guides

Ready-to-build artifacts derived from the function specs:


| #   | Document                                                      | Description                                      |
| --- | ------------------------------------------------------------- | ------------------------------------------------ |
| 01  | [Database Design](implementation/01-database-design.md)       | DynamoDB single-table schema, GSIs, TTL, access patterns |
| 02  | [API Specification](implementation/02-api-specification.md) | All endpoints with request/response JSON         |
| 03  | [Task Plan](implementation/03-task-plan.md)                 | Sprint-by-sprint implementation backlog          |
| 04  | [Onboarding & Registration](implementation/04-onboarding-and-registration.md) | Signup, verify, wizard steps, team invites |
| 05  | [UI Inventory & Actions](implementation/05-ui-inventory.md) | All screens, elements, and user actions |
| 06  | [API Implementation Status](implementation/06-api-implementation-status.md) | Built vs mock vs remaining endpoints |


---

## Implementation phases


| #   | Document                                      | Timeline   | Goal                       |
| --- | --------------------------------------------- | ---------- | -------------------------- |
| 01  | [Phase 1 — MVP](phases/01-phase-mvp.md)       | 8–10 weeks | WhatsApp + widget + ingest |
| 02  | [Phase 2 — Growth](phases/02-phase-growth.md) | 6–8 weeks  | All channels + billing     |
| 03  | [Phase 3 — Scale](phases/03-phase-scale.md)   | 8–12 weeks | Shopify + enterprise       |


---

## Quick reference


| Decision       | Choice                                         |
| -------------- | ---------------------------------------------- |
| Cloud          | AWS serverless                                 |
| Chat LLM       | OpenAI GPT-4o mini (primary)                   |
| Embeddings     | OpenAI text-embedding-3-small                  |
| Vector store   | Amazon S3 Vectors                              |
| LLM fallback   | Amazon Bedrock                                 |
| Channels       | Meta Graph API                                 |
| Merchant auth  | DynamoDB + JWT (no Cognito)                    |
| MFA            | Off MVP; TOTP + email Phase 2; SMS Phase 3   |
| Auth + platform email | Resend (`EmailProvider`)              |
| SMS            | Skipped MVP; Twilio optional Phase 3         |
| Billing        | Trial + lifecycle cron (payment gateway deferred) |


---

## Document conventions

- **Version** and **status** in each document header
- Cross-references use relative links
- APIs use `/api/v1/` prefix
- All tenant data keyed by `TENANT#<tenantId>`

