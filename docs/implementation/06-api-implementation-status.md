# API Implementation Status

**Parent:** [02-api-specification.md](02-api-specification.md)  
**Last updated:** 2026-06-07  
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

**Git (local `main`):** through `d149a95` (usage/conversations/widget) + dashboard + widget bundle (uncommitted). Not pushed.

---

## 1. Summary

| Category | Count |
|----------|------:|
| **Implemented** (real Lambda + DynamoDB) | **35 routes** |
| **Mock only** (UI works; fixture data) | **6 routes** |
| **Not started** (no handler, no mock) | 12+ routes |
| **Phase 2** (billing, MFA, team list) | 8 routes |

The admin UI calls all endpoints over HTTP. The local dev server routes matching paths to Lambda handlers; everything else falls through to `@commercechat/mock-api`.

**Widget bundle:** `GET /widget/v1.js` served from `apps/widget/public/v1.js` (not counted as API route).

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
| `GET` | `/api/v1/tenants/me` | `tenant-me` | Yes |
| `PATCH` | `/api/v1/tenants/me` | `tenant-me` | Yes |
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
| `POST` | `/api/v1/chat` | `chat-api` | Yes |
| `GET` | `/api/v1/conversations` | `conversations` | Yes |
| `GET` | `/api/v1/conversations/{id}` | `conversations` | Yes |
| `GET` | `/api/v1/conversations/{id}/messages` | `conversations` | Yes |
| `GET` | `/api/v1/widget/config` | `widget` | Yes |
| `POST` | `/api/v1/widget/chat` | `widget` | Yes (embed) |
| `GET` | `/api/v1/dashboard/stats` | `dashboard-stats` | Yes |

**Also built (not a route):**
- `jwt-authorizer` — API Gateway authorizer; Bearer in handlers locally
- Chat orchestrator — `packages/core/src/chat/`
- Widget embed — `apps/widget/public/v1.js` at `/widget/v1.js`

**Code locations:**
- Handlers: `apps/api/src/handlers/`
- Business logic: `packages/core/src/`
- UI route list: `apps/admin/src/lib/api/implemented.ts`

---

## 3. Mock only (next to replace)

| Method | Route | Suggested Lambda | Priority |
|--------|-------|------------------|----------|
| `GET` | `/api/v1/channels` | `channels` | P1 |
| `POST` | `/api/v1/channels/meta/connect` | `channels-meta-connect` | P1 |
| `DELETE` | `/api/v1/channels/meta/{channel}` | `channels-meta-disconnect` | P1 |
| `GET` | `/api/v1/channels/meta/health` | `channels-meta-health` | P2 |
| `GET` | `/api/v1/team` | `team` | P2 |
| `POST` | `/auth/invite` | `auth-invite` | P2 |

---

## 4. Not started (no mock, no Lambda)

### MVP — remaining

| Method | Route | Sprint | Notes |
|--------|-------|--------|-------|
| `POST` | `/api/v1/tenants/me/logo` | 1 | S3 presigned upload |
| `POST` | `/api/v1/knowledge/faq` | 2 | Inline FAQ ingest |
| `GET` | `/api/v1/commerce/products` | 3 | Product catalog admin |
| `GET/POST` | `/webhooks/meta` | 4 | WhatsApp inbound |
| `POST` | `/auth/accept-invite` | 8 | Team onboarding |

### Phase 2

Billing, MFA, team CRUD, `POST /api/v1/widget/chat/stream` (SSE).

---

## 5. Recommended build order

1. **Sprint 4 Meta** — webhooks, WhatsApp connect, real channel health on dashboard
2. **Infra** — CDK deploy, Resend email, CI
3. **Widget polish** — product cards in embed, rate limiting
4. **Phase 2** — billing, team, MFA

---

## 6. UI ↔ API matrix

| Admin screen | Live API | Mock fallback |
|--------------|----------|---------------|
| Auth, profile, onboarding, knowledge | Yes | — |
| Bot config + test simulator | Config + chat orchestrator | — |
| Usage, dashboard | Usage + dashboard stats | — |
| Conversations | List, thread, messages | — |
| Widget / API keys | Config, regen-key, embed snippet | — |
| Channels | — | Connect, health |
| Team | — | List, invite |

---

## 7. Local dev checklist

```bash
docker compose up -d
cp apps/api/.env.example apps/api/.env
npm run dev                   # API :3001 + Admin :3000
```

**Widget demo:** Regenerate API key in Settings → API keys, paste embed into `apps/widget/demo.html`, open via any static server or storefront.

**Test scripts:**
```bash
cd apps/api && node scripts/test-dashboard-widget.mjs
cd apps/api && node scripts/test-chat.mjs
cd apps/api && node scripts/test-usage-widget-conversations.mjs
```
