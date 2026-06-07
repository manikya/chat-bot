# API Implementation Status

**Parent:** [02-api-specification.md](02-api-specification.md)  
**Last updated:** 2026-06-07  
**Local API:** `http://localhost:3001` (real Lambdas + mock fallback)

---

## 1. Summary

| Category | Count |
|----------|------:|
| **Implemented** (real Lambda + DynamoDB) | 10 routes |
| **Mock only** (UI works; fixture data) | 22 routes |
| **Not started** (no handler, no mock) | 15+ routes |
| **Phase 2** (billing, MFA, team) | 8 routes |

The admin UI calls all endpoints over HTTP. The local dev server (`apps/api/src/local/server.ts`) routes matching paths to Lambda handlers; everything else falls through to `@commercechat/mock-api`.

---

## 2. Implemented (real)

| Method | Route | Lambda handler | UI connected |
|--------|-------|----------------|:------------:|
| `GET` | `/health` | `health` | — |
| `POST` | `/auth/signup` | `auth-signup` | Yes |
| `POST` | `/auth/login` | `auth-login` | Yes |
| `GET` | `/auth/me` | `auth-me` | Yes |
| `POST` | `/auth/verify-email` | `auth-verify-email` | Yes |
| `GET` | `/api/v1/tenants/me` | `tenant-me` | Yes |
| `PATCH` | `/api/v1/tenants/me` | `tenant-me` | Yes |
| `GET` | `/api/v1/tenants/me/config` | `tenant-config` | Yes |
| `PATCH` | `/api/v1/tenants/me/config` | `tenant-config` | Yes |
| `GET` | `/api/v1/tenants/me/limits` | `tenant-limits` | Yes |

**Also built (not a route):** `jwt-authorizer` — API Gateway authorizer; used locally via Bearer token in handlers.

**Code locations:**
- Handlers: `apps/api/src/handlers/`
- Business logic: `packages/core/src/`
- UI route list: `apps/admin/src/lib/api/implemented.ts`

---

## 3. Mock only (next to replace)

These routes have **mock HTTP handlers** (`packages/mock-api/src/server/app.ts`) and are **used by the admin UI**, but no real Lambda exists yet.

### Auth (Sprint 1 remainder)

| Method | Route | Suggested Lambda | Priority |
|--------|-------|------------------|----------|
| `POST` | `/auth/refresh` | `auth-refresh` | P0 |
| `POST` | `/auth/logout` | `auth-logout` | P0 |
| `POST` | `/auth/forgot-password` | `auth-password` | P1 |
| `POST` | `/auth/reset-password` | `auth-password` | P1 |
| `POST` | `/auth/resend-verification` | `auth-verify-email` (extend) | P1 |

### Onboarding (Sprint 1 / 5)

| Method | Route | Suggested Lambda | Priority |
|--------|-------|------------------|----------|
| `GET` | `/api/v1/onboarding` | `onboarding` | P1 |
| `PATCH` | `/api/v1/onboarding/step` | `onboarding` | P1 |
| `POST` | `/api/v1/onboarding/test-chat` | `chat-api` | P2 |

### Tenant (Sprint 5)

| Method | Route | Suggested Lambda | Priority |
|--------|-------|------------------|----------|
| `GET` | `/api/v1/tenants/me/usage` | `tenant-usage` | P1 |
| `POST` | `/api/v1/tenants/me/widget/regenerate-key` | `tenant-widget-key` | P1 |

### Dashboard (admin-only; not in OpenAPI summary)

| Method | Route | Suggested Lambda | Priority |
|--------|-------|------------------|----------|
| `GET` | `/api/v1/dashboard/stats` | `dashboard-stats` | P2 |

### Channels (Sprint 4)

| Method | Route | Suggested Lambda | Priority |
|--------|-------|------------------|----------|
| `GET` | `/api/v1/channels` | `channels` | P1 |
| `POST` | `/api/v1/channels/meta/connect` | `channels-meta-connect` | P1 |
| `DELETE` | `/api/v1/channels/meta/{channel}` | `channels-meta-disconnect` | P1 |
| `GET` | `/api/v1/channels/meta/health` | `channels-meta-health` | P2 |

### Knowledge (Sprint 2)

| Method | Route | Suggested Lambda | Priority |
|--------|-------|------------------|----------|
| `GET` | `/api/v1/knowledge/sources` | `knowledge-sources` | P1 |
| `POST` | `/api/v1/knowledge/sources` | `knowledge-sources` | P1 |
| `POST` | `/api/v1/knowledge/sources/{sourceId}/sync` | `knowledge-sync` | P1 |
| `GET` | `/api/v1/knowledge/jobs` | `knowledge-jobs` | P1 |
| `DELETE` | `/api/v1/knowledge/sources/{sourceId}` | `knowledge-sources` | P2 |

### Conversations (Sprint 4)

| Method | Route | Suggested Lambda | Priority |
|--------|-------|------------------|----------|
| `GET` | `/api/v1/conversations` | `conversations` | P1 |
| `GET` | `/api/v1/conversations/{conversationId}` | `conversations` | P1 |
| `GET` | `/api/v1/conversations/{conversationId}/messages` | `conversations` | P1 |

### Chat & widget (Sprint 3 / 5)

| Method | Route | Suggested Lambda | Priority |
|--------|-------|------------------|----------|
| `POST` | `/api/v1/chat` | `chat-api` | P1 |
| `GET` | `/api/v1/widget/config` | `widget-config` | P1 |
| `POST` | `/api/v1/widget/chat` | `widget-chat` | P1 |

### Team invites (mock; full team is Phase 2)

| Method | Route | Suggested Lambda | Priority |
|--------|-------|------------------|----------|
| `POST` | `/auth/invite` | `auth-invite` | P2 |

---

## 4. Not started (no mock, no Lambda)

Routes defined in [02-api-specification.md](02-api-specification.md) that are **not** implemented and **not** served by the mock server.

### MVP — remaining

| Method | Route | Sprint | Notes |
|--------|-------|--------|-------|
| `POST` | `/api/v1/tenants/me/logo` | 1 | S3 presigned upload |
| `GET` | `/api/v1/knowledge/jobs/{jobId}` | 2 | Job detail |
| `POST` | `/api/v1/knowledge/faq` | 2 | Inline FAQ ingest |
| `GET` | `/api/v1/commerce/products` | 3 | Product catalog admin |
| `POST` | `/api/v1/commerce/products/import` | 3 | CSV/JSON import |
| `GET` | `/api/v1/commerce/orders` | 3 | Order list |
| `PATCH` | `/api/v1/commerce/connector` | 3 | Connector config |
| `GET` | `/webhooks/meta` | 4 | Meta verify challenge |
| `POST` | `/webhooks/meta` | 4 | Inbound Meta events |
| `POST` | `/auth/accept-invite` | 8 | Team onboarding |

### Phase 2

| Method | Route | Area |
|--------|-------|------|
| `POST` | `/auth/mfa/verify` | MFA |
| `GET` | `/api/v1/team` | Team list |
| `DELETE` | `/api/v1/team/{userId}` | Remove member |
| `GET` | `/api/v1/billing/subscription` | Stripe |
| `POST` | `/api/v1/billing/checkout` | Stripe |
| `POST` | `/api/v1/billing/portal` | Stripe |
| `POST` | `/webhooks/stripe` | Stripe lifecycle |
| `POST` | `/api/v1/widget/chat/stream` | SSE streaming |

---

## 5. Recommended build order

Aligned with [03-task-plan.md](03-task-plan.md):

1. **Finish Sprint 1 auth** — `auth-refresh`, `auth-logout`, `auth-password` (forgot/reset/resend)
2. **Sprint 2 knowledge** — source CRUD, sync, jobs (replace knowledge mocks)
3. **Sprint 3 chat** — `chat-api`, usage metering → real `GET /tenants/me/usage`
4. **Sprint 4 Meta** — webhooks + channel connect + conversations APIs
5. **Sprint 5 widget** — API key routing, `widget-config`, `widget-chat`, regenerate-key
6. **Phase 2** — billing, team, MFA

---

## 6. UI ↔ API matrix

| Admin screen | Live API | Mock fallback |
|--------------|----------|---------------|
| Signup, login, verify email | Auth | — |
| Settings → Profile | `GET/PATCH /tenants/me` | — |
| Onboarding → Profile | `PATCH /tenants/me` | Onboarding step advance |
| Bot config | `GET/PATCH /tenants/me/config` | Test chat simulator |
| Widget appearance | `PATCH /tenants/me/config` | Embed code, widget config GET |
| Usage → plan limits | `GET /tenants/me/limits` | Usage metrics, message counts |
| Dashboard | — | Stats, channel health |
| Conversations | — | List, thread, messages |
| Knowledge | — | Sources, jobs, sync |
| Channels | — | Connect, health |
| Team / API keys | — | Team list, invite, key regen |
| Onboarding steps 2–6 | — | Channels, knowledge, test, widget |

---

## 7. Local dev checklist

```bash
docker compose up -d          # LocalStack DynamoDB (required for real APIs)
cp apps/api/.env.example apps/api/.env
npm run dev                   # API :3001 + Admin :3000
```

**Real auth flow:** signup → verify email (token logged in API console) → login.

**Verify implementation:** `GET http://localhost:3001/health` should return `"runtime":"aws-lambda"`, not `"mock-1.0.0"`.

---

## 8. Related docs

- Full request/response shapes: [02-api-specification.md](02-api-specification.md)
- Sprint backlog: [03-task-plan.md](03-task-plan.md)
- Lambda deploy map: [../../infra/README.md](../../infra/README.md)
- Admin UI: [../../apps/admin/README.md](../../apps/admin/README.md)
