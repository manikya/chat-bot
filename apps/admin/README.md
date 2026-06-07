# CommerceChat Admin

Next.js merchant dashboard connected to the local API server (real Lambdas + mock fallback).

## Run

From repo root (starts **API + UI** together):

```bash
docker compose up -d
cp apps/api/.env.example apps/api/.env
npm install
npm run dev
```

| Service  | URL                                            |
| -------- | ---------------------------------------------- |
| Admin UI | [http://localhost:3000](http://localhost:3000) |
| API      | [http://localhost:3001](http://localhost:3001) |

UI only: `npm run dev:ui`

## First-time auth (real API)

1. Open `/signup` and create an account.
2. Check the **API terminal** for a logged verify-email URL (or JSON with `token`).
3. Open that URL (or `/verify-email?token=...`) to verify.
4. Sign in at `/login`.

Demo credentials (`owner@store.com`) only work when using mock auth — not with DynamoDB until a seed script exists.

## Environment

`apps/admin/.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:3001
```

All requests go through the API server. Implemented routes hit Lambdas; others use mock fallback.

## Architecture

```
apps/admin/src/lib/api/     → HTTP client → localhost:3001
packages/mock-api/          → Mock fallback (unimplemented routes only)
packages/core/              → Real Lambda business logic + DynamoDB
```

### API connection

| UI area | Backend |
|---------|---------|
| Signup, login, logout, refresh, verify, forgot/reset password | **Real Lambda** + DynamoDB |
| Session auto-refresh + expired-session dialog | **Real** (client + `/auth/refresh`) |
| Settings profile, onboarding profile | **Real** `GET/PATCH /tenants/me` (timezone dropdown) |
| Onboarding wizard (steps, test-chat) | **Real** `/api/v1/onboarding/*` |
| Knowledge sources, sync, jobs | **Real** `/api/v1/knowledge/*` (stub sync — no crawl yet) |
| Bot config, widget colors | **Real** `GET/PATCH /tenants/me/config` |
| Usage plan limits | **Real** `GET /tenants/me/limits` |
| Onboarding channels, dashboard, conversations, widget GET, usage metrics | Mock fallback on API server |

Full API status: [docs/implementation/06-api-implementation-status.md](../../docs/implementation/06-api-implementation-status.md)

## Pages

| Route            | Screen                  |
| ---------------- | ----------------------- |
| `/login`         | Sign in                 |
| `/signup`        | Register                |
| `/onboarding/*`  | 6-step wizard           |
| `/dashboard`     | Home                    |
| `/conversations` | Conversation list       |
| `/knowledge`     | Knowledge sources       |
| `/bot`           | Bot config + simulator  |
| `/channels`      | Meta channels           |
| `/widget`        | Embed code              |
| `/usage`         | Quotas                  |
| `/settings/*`    | Profile, team, API keys |
