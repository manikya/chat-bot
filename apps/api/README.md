# CommerceChat API (Lambda)

AWS Lambda handlers with shared business logic in `@commercechat/core`.

## Architecture

```
apps/api/src/handlers/     ← Lambda entry points (thin)
apps/api/src/local/        ← Local dev server (real routes + mock fallback)
packages/core/             ← Business logic + DynamoDB
packages/shared/           ← Types, API envelope, errors
packages/mock-api/         ← Temporary fallback for unbuilt routes
```

## Local development

```bash
docker compose up -d
cp .env.example .env
npm run dev
```

**URL:** http://localhost:3001

Real Lambda routes use **DynamoDB (LocalStack)**. All other UI paths hit the mock fallback until their handlers ship.

## Build Lambda bundles

```bash
npm run build:lambdas
# → apps/api/dist/handlers/*.cjs
```

Deploy each `.cjs` file to its named Lambda. See [infra/README.md](../../infra/README.md).

## Implemented (16 routes)

| Handler | Routes |
|---------|--------|
| `health` | `GET /health` |
| `auth-signup` | `POST /auth/signup` |
| `auth-login` | `POST /auth/login` |
| `auth-refresh` | `POST /auth/refresh` |
| `auth-logout` | `POST /auth/logout` |
| `auth-forgot-password` | `POST /auth/forgot-password` |
| `auth-reset-password` | `POST /auth/reset-password` |
| `auth-resend-verification` | `POST /auth/resend-verification` |
| `auth-me` | `GET /auth/me` |
| `auth-verify-email` | `POST /auth/verify-email` |
| `tenant-me` | `GET/PATCH /api/v1/tenants/me` |
| `tenant-config` | `GET/PATCH /api/v1/tenants/me/config` |
| `tenant-limits` | `GET /api/v1/tenants/me/limits` |
| `jwt-authorizer` | API Gateway authorizer (not a route) |

## Remaining APIs

Full breakdown with priorities and UI mapping: **[docs/implementation/06-api-implementation-status.md](../../docs/implementation/06-api-implementation-status.md)**

### MVP (mock exists — replace with real)

- **Onboarding** — `GET/PATCH /api/v1/onboarding`, `POST /api/v1/onboarding/test-chat`
- **Knowledge** — sources CRUD, sync, jobs
- **Chat** — `POST /api/v1/chat`
- **Channels** — list, Meta connect/disconnect, health
- **Conversations** — list, detail, messages
- **Widget** — `GET /api/v1/widget/config`, `POST /api/v1/widget/chat`
- **Tenant** — `GET /api/v1/tenants/me/usage`, `POST /api/v1/tenants/me/widget/regenerate-key`
- **Dashboard** — `GET /api/v1/dashboard/stats`

### MVP (not started)

- `POST /api/v1/tenants/me/logo`
- Knowledge: `GET /knowledge/jobs/{jobId}`, `POST /knowledge/faq`
- Commerce: products, orders, connector
- Webhooks: `GET/POST /webhooks/meta`

### Phase 2

- Billing (`/api/v1/billing/*`, `/webhooks/stripe`)
- Team (`GET/DELETE /api/v1/team`, `/auth/invite`, `/auth/accept-invite`)
- MFA (`POST /auth/mfa/verify`)
- Widget SSE (`POST /api/v1/widget/chat/stream`)
