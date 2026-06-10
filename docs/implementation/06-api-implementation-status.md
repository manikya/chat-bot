# API Implementation Status

**Parent:** [02-api-specification.md](02-api-specification.md)  
**Last updated:** 2026-06-10  
**Local API:** `http://localhost:3001` (real Lambdas + mock fallback)

---

## 0. Recent progress

| Date | Milestone |
|------|-----------|
| 2026-06-06 | Initial monorepo: admin UI, auth + tenant Lambdas, mock fallback |
| 2026-06-07 | Auth session flows, onboarding APIs, knowledge source CRUD |
| 2026-06-07 | Knowledge ingest: website crawl, catalog CSV, RAG (`FileVectorStore`) |
| 2026-06-07 | Chat orchestrator: OpenAI, tools, `POST /api/v1/chat` |
| 2026-06-07 | Usage, conversations, widget APIs + API key auth |
| 2026-06-07 | Dashboard stats (live DynamoDB counts), widget `v1.js` bundle |
| 2026-06-07 | Widget message formatting (bold, lists, line breaks) + product action chips |
| 2026-06-08 | WhatsApp OAuth via ngrok, WABA discovery, dev token connect |
| 2026-06-10 | Team list/invite, logo upload, FAQ ingest, commerce products APIs + admin UI |
| 2026-06-10 | `POST /auth/accept-invite` + `/accept-invite` UI (team join E2E) |
| 2026-06-10 | Team remove/role APIs, S3 presigned logo via LocalStack |
| 2026-06-10 | Billing plans + usage overview APIs, payment webhook stub (no Stripe) |

**Git (local `main`):** through billing UI + gateway-ready checkout. Not pushed.

---

## 1. Summary

| Category | Count |
|----------|------:|
| **Implemented** (real Lambda + DynamoDB) | **52 routes** |
| **Mock only** (UI works; fixture data) | **0 routes** |
| **Not started** (no handler, no mock) | 8+ routes |
| **Phase 2** (billing, MFA, widget SSE) | 8 routes |

The admin UI calls all endpoints over HTTP. The local dev server routes matching paths to Lambda handlers; everything else falls through to `@commercechat/mock-api`.

**Widget bundle:** `GET /widget/v1.js` served from `apps/widget/public/v1.js` (not counted as API route).  
**Widget demo:** `http://localhost:3001/widget/demo.html?key=pk_live_...` (must be HTTP, not `file://`).

---

## 2. Implemented (real)

| Method | Route | Handler | UI connected |
|--------|-------|---------|:------------:|
| `GET` | `/health` | `health` | — |
| `POST` | `/auth/signup` | `auth-signup` | Yes |
| `POST` | `/auth/login` | `auth-login` | Yes |
| `GET` | `/auth/me` | `auth-me` | Yes |
| `POST` | `/auth/verify-email` | `auth-verify-email` | Yes |
| `POST` | `/auth/refresh` | `auth-refresh` | Yes |
| `POST` | `/auth/logout` | `auth-logout` | Yes |
| `POST` | `/auth/forgot-password` | `auth-forgot-password` | Yes |
| `POST` | `/auth/reset-password` | `auth-reset-password` | Yes |
| `POST` | `/auth/resend-verification` | `auth-resend-verification` | Yes |
| `POST` | `/auth/invite` | `auth-invite` | Yes |
| `POST` | `/auth/accept-invite` | `auth-accept-invite` | Yes |
| `GET` | `/api/v1/tenants/me` | `tenant-me` | Yes |
| `PATCH` | `/api/v1/tenants/me` | `tenant-me` | Yes |
| `POST` | `/api/v1/tenants/me/logo` | `tenant-logo` | Yes |
| `POST` | `/api/v1/tenants/me/logo/presign` | `tenant-logo-presign` | Yes |
| `POST` | `/api/v1/tenants/me/logo/complete` | `tenant-logo-complete` | Yes |
| `GET` | `/api/v1/tenants/me/config` | `tenant-config` | Yes |
| `PATCH` | `/api/v1/tenants/me/config` | `tenant-config` | Yes |
| `GET` | `/api/v1/tenants/me/limits` | `tenant-limits` | Yes |
| `GET` | `/api/v1/tenants/me/usage` | `tenant-usage` | Yes |
| `POST` | `/api/v1/tenants/me/widget/regenerate-key` | `tenant-widget-key` | Yes |
| `GET` | `/api/v1/onboarding` | `onboarding` | Yes |
| `PATCH` | `/api/v1/onboarding/step` | `onboarding` | Yes |
| `POST` | `/api/v1/onboarding/test-chat` | `onboarding-test-chat` | Yes |
| `GET` | `/api/v1/knowledge/sources` | `knowledge-sources` | Yes |
| `POST` | `/api/v1/knowledge/sources` | `knowledge-sources` | Yes |
| `DELETE` | `/api/v1/knowledge/sources/{sourceId}` | `knowledge-sources` | Yes |
| `POST` | `/api/v1/knowledge/sources/{sourceId}/sync` | `knowledge-sync` | Yes |
| `GET` | `/api/v1/knowledge/jobs` | `knowledge-jobs` | Yes |
| `GET` | `/api/v1/knowledge/jobs/{jobId}` | `knowledge-jobs` | Yes |
| `POST` | `/api/v1/knowledge/faq` | `knowledge-faq` | Yes |
| `GET` | `/api/v1/commerce/products` | `commerce-products` | Yes |
| `GET` | `/api/v1/team` | `team` | Yes |
| `PATCH` | `/api/v1/team/{userId}` | `team-member` | Yes |
| `DELETE` | `/api/v1/team/{userId}` | `team-member` | Yes |
| `POST` | `/api/v1/chat` | `chat-api` | Yes |
| `GET` | `/api/v1/conversations` | `conversations` | Yes |
| `GET` | `/api/v1/conversations/{id}` | `conversations` | Yes |
| `GET` | `/api/v1/conversations/{id}/messages` | `conversations` | Yes |
| `GET` | `/api/v1/widget/config` | `widget` | Yes |
| `POST` | `/api/v1/widget/chat` | `widget` | Yes (embed) |
| `GET` | `/api/v1/dashboard/stats` | `dashboard-stats` | Yes |
| `GET` | `/api/v1/channels` | `channels` | Yes |
| `POST` | `/api/v1/channels/meta/connect` | `channels-meta-connect` | Yes |
| `POST` | `/api/v1/channels/meta/connect-dev` | `channels-meta-connect-dev` | Yes |
| `GET` | `/api/v1/channels/meta/dev-status` | `channels-meta-dev-status` | Yes |
| `DELETE` | `/api/v1/channels/meta/{channel}` | `channels-meta-disconnect` | Yes |
| `GET` | `/api/v1/channels/meta/health` | `channels-meta-health` | Yes |
| `GET` | `/api/v1/billing/plans` | `billing` | Yes |
| `GET` | `/api/v1/billing/subscription` | `billing` | Yes |
| `GET` | `/api/v1/billing/overview` | `billing` | Yes |
| `POST` | `/api/v1/billing/checkout` | `billing` | Yes |
| `POST` | `/webhooks/payment` | `webhook-payment` | — |
| `GET` | `/webhooks/meta` | `webhooks-meta` | — |
| `POST` | `/webhooks/meta` | `webhooks-meta` | — |

**Also built (not a route):**
- `jwt-authorizer` — API Gateway authorizer; Bearer in handlers locally
- Chat orchestrator — `packages/core/src/chat/`
- Logo storage — S3 presigned upload (`POST .../logo/presign` + `complete`) via LocalStack; local filesystem fallback when `S3_BUCKET` unset
- Widget embed — `apps/widget/public/v1.js` at `/widget/v1.js` (shadow DOM, sync chat, `formatBotText` for `**bold**` / numbered lists / `\n`, `suggestedActions` product chips)
- Embed snippet — `buildWidgetEmbedCode()` uses `API_PUBLIC_URL` (Settings → API keys)

**Code locations:**
- Handlers: `apps/api/src/handlers/`
- Business logic: `packages/core/src/`
- UI route list: `apps/admin/src/lib/api/implemented.ts`

---

## 3. Mock only (next to replace)

_None — all admin screens use real handlers locally._

---

## 4. Not started (no mock, no Lambda)

### MVP — remaining

_None — core auth + team invite flow complete._

### Phase 2

MFA, `POST /api/v1/widget/chat/stream` (SSE), production CDN for S3 assets, full payment gateway adapter (Sri Lankan provider).

---

## 5. Recommended build order

1. **WhatsApp E2E** — ngrok API webhooks, inbound message + reply test
2. **Infra** — CDK deploy, production S3/CDN, CI
3. **Widget polish** — rich product cards, rate limiting, CDN deploy
4. **Phase 2** — payment gateway adapter, MFA, widget SSE

---

## 6. UI ↔ API matrix

| Admin screen | Live API | Mock fallback |
|--------------|----------|---------------|
| Auth, profile, onboarding, knowledge | Yes | — |
| Team list, invite, remove, role change, accept invite | Yes | — |
| Logo upload — S3 presign (onboarding profile) | Yes | — |
| FAQ quick-add, catalog products (knowledge page) | Yes | — |
| Bot config + test simulator | Config + chat orchestrator | — |
| Usage, billing, dashboard | Usage overview, billing plans/checkout | — |
| Conversations | List, thread, messages | — |
| Widget / API keys | Config, regen-key, embed snippet | — |
| Channels | Connect, health, webhooks | — |

---

## 7. Local dev checklist

```bash
docker compose up -d          # LocalStack: DynamoDB + S3 (commercechat-assets)
cp apps/api/.env.example apps/api/.env
# Optional in apps/api/.env — S3 logo presign + Zoho SMTP (see .env.example)
npm run dev                   # API :3001 + Admin :3000
```

**S3 logos (LocalStack):** With `S3_BUCKET=commercechat-assets` set, logos upload via presigned PUT to  
`http://localhost:4566/commercechat-assets/logos/{tenantId}.{ext}`. Bucket + CORS are created by  
`scripts/localstack-init/02-create-s3-bucket.sh` on container start.

**Widget demo:** Regenerate API key in Settings → API keys, then open  
`http://localhost:3001/widget/demo.html?key=pk_live_...` while `npm run dev` is running.

**Test scripts:**
```bash
cd apps/api && node scripts/test-dashboard-widget.mjs
cd apps/api && node scripts/test-chat.mjs
cd apps/api && node scripts/test-usage-widget-conversations.mjs
```
