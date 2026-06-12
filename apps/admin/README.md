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

`apps/admin/.env.local` (local dev):

```
NEXT_PUBLIC_API_URL=http://localhost:3001
```

Production static build (`npm run build:static`) bakes `NEXT_PUBLIC_API_URL` at build time.

All requests go through the API server. Implemented routes hit Lambdas; others use mock fallback.

## Deploy to AWS (S3 + CloudFront)

Static export — no Node server in production. From repo root:

```bash
npm run deploy:admin -- \
  --credentials-csv="/path/to/accessKeys.csv" \
  --env=dev \
  --region=us-east-1 \
  --api-url=https://YOUR_API_GATEWAY_URL
```

`--api-url` defaults to the latest API deploy inventory in `infra/deployments/` if omitted.

After deploy:

1. Open the printed **Admin URL** (CloudFront).
2. Add Meta OAuth redirect: `{AdminUrl}/channels/meta/callback/`
3. Redeploy API with `--app-url={AdminUrl}` so auth emails link correctly.

See [infra/aws-serverless-deployment.md](../../infra/aws-serverless-deployment.md).

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
| Knowledge sources, sync, jobs (website + catalog + FAQ) | **Real** `/api/v1/knowledge/*` |
| Logo upload (onboarding profile) | **Real** S3 presign (`/logo/presign` + `/complete`) or multipart `/logo` |
| Team list, invite, remove, role change | **Real** `GET/PATCH/DELETE /api/v1/team`, `POST /auth/invite` |
| Accept team invite | **Real** `POST /auth/accept-invite` at `/accept-invite` |
| Auth emails (verify, reset, invite) | **Real** Zoho SMTP when `SMTP_*` set in `apps/api/.env` |
| Commerce products (knowledge page) | **Real** `GET /api/v1/commerce/products` |
| Bot config, chat simulator, widget colors | **Real** config + chat orchestrator |
| Usage, dashboard stats, conversations | **Real** DynamoDB metering + threads |
| Widget embed, API key regen | **Real** `/widget/v1.js` + widget APIs |
| Channels (Meta connect, health) | **Real** `/api/v1/channels/*` |

Full API status: [docs/implementation/06-api-implementation-status.md](../../docs/implementation/06-api-implementation-status.md)

## Pages

| Route            | Screen                  |
| ---------------- | ----------------------- |
| `/login`         | Sign in                 |
| `/signup`        | Register                |
| `/accept-invite` | Join store from invite  |
| `/onboarding/*`  | 6-step wizard           |
| `/dashboard`     | Home                    |
| `/conversations` | Conversation list       |
| `/knowledge`     | Knowledge sources       |
| `/bot`           | Bot config + simulator  |
| `/channels`      | Meta channels           |
| `/widget`        | Embed code              |
| `/usage`         | Quotas                  |
| `/settings/*`    | Profile, team, API keys |
