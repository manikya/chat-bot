# CommerceChat API (Lambda)

AWS Lambda handlers with shared business logic in `@commercechat/core`.

## Architecture

```
apps/api/src/handlers/     ← Lambda entry points (thin)
apps/api/src/local/        ← Local dev server (real routes + mock fallback)
apps/widget/public/        ← Embeddable widget bundle (served at /widget/v1.js)
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
**Widget:** http://localhost:3001/widget/v1.js

Real Lambda routes use **DynamoDB (LocalStack)**.

## Meta channels (WhatsApp + Messenger)

See [docs/functions/02-meta-channel-integration.md](../../docs/functions/02-meta-channel-integration.md) and [docs/implementation/06-api-implementation-status.md](../../docs/implementation/06-api-implementation-status.md).

**Local webhook tunnel:**

```bash
npm run dev:ngrok:ui    # :3000 — admin proxies /webhooks/* to this API
```

Meta webhook callback: `https://<ngrok>.ngrok-free.dev/webhooks/meta`

## Build Lambda bundles

```bash
npm run build:lambdas
# → apps/api/dist/handlers/*.cjs
```

## Implemented (~85 routes)

See [docs/implementation/06-api-implementation-status.md](../../docs/implementation/06-api-implementation-status.md) for the full table and **recommended next steps**.

**Highlights:**
- Auth, tenant, onboarding, team
- Knowledge ingest (website, catalog, FAQ, page-voice/conversation export)
- Chat orchestrator (`POST /api/v1/chat`)
- Usage, conversations, dashboard stats, billing (trial lifecycle, cancel/reactivate)
- Widget config/chat + SSE stream + API key auth + plan rate limits; CDN embed with `api_url`
- WhatsApp + Messenger + Instagram connect/disconnect/health
- Meta webhooks (`GET`/`POST /webhooks/meta`)
- Billing crons via EventBridge (`cron-billing-lifecycle`, `cron-meta-token-refresh`)
- Commerce: WooCommerce (`/api/v1/commerce/wordpress/*` + `POST /webhooks/commerce/woocommerce`)
- Shopify (`/api/v1/commerce/shopify/*`, widget toggle, catalog webhooks)
- Shopify Partner app (serverless Express on Lambda): `GET/POST /shopify-app/*` (`shopify-app` handler)
- Static widget bundle at `GET /widget/v1.js` (CDN) or API origin when no CDN

## AWS deploy

```bash
npm run deploy:aws:full -- --credentials-csv="..." --env=dev --region=us-east-1
```

See [infra/aws-serverless-deployment.md](../../infra/aws-serverless-deployment.md).

## Test scripts

```bash
node scripts/test-dashboard-widget.mjs
node scripts/test-chat.mjs
node scripts/test-usage-widget-conversations.mjs
node scripts/test-catalog-chat.mjs
node scripts/test-billing-limits.mjs
node scripts/test-s3-vectors-ingest.mjs
```

## Environment

```
API_PUBLIC_URL=http://localhost:3001   # widget script URL in embed snippets
OPENAI_API_KEY=sk-...                  # chat + embeddings

# Meta (see .env.example for full list)
META_APP_ID=
META_APP_SECRET=
META_VERIFY_TOKEN=
META_OAUTH_REDIRECT_URI=https://<ngrok>.ngrok-free.dev/channels/meta/callback
```
