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

Real Lambda routes use **DynamoDB (LocalStack)**. Channels and team hit mock fallback.

## Build Lambda bundles

```bash
npm run build:lambdas
# → apps/api/dist/handlers/*.cjs
```

## Implemented (35 routes)

See [docs/implementation/06-api-implementation-status.md](../../docs/implementation/06-api-implementation-status.md) for the full table.

**Highlights:**
- Auth, tenant, onboarding
- Knowledge ingest (website crawl, catalog CSV, jobs)
- Chat orchestrator (`POST /api/v1/chat`)
- Usage, conversations, dashboard stats
- Widget config/chat + API key auth
- Static widget bundle at `GET /widget/v1.js`

## Test scripts

```bash
node scripts/test-dashboard-widget.mjs
node scripts/test-chat.mjs
node scripts/test-usage-widget-conversations.mjs
node scripts/test-catalog-chat.mjs
```

## Remaining (mock)

- Channels — Meta connect/disconnect/health
- Team — list, invite

## Environment

```
API_PUBLIC_URL=http://localhost:3001   # widget script URL in embed snippets
OPENAI_API_KEY=sk-...                  # chat + embeddings
```
