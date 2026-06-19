# Infrastructure

Lambda deployment map for API Gateway HTTP API.

For AWS serverless deployment prep, tagging, and cost grouping, see
[aws-serverless-deployment.md](aws-serverless-deployment.md). The machine-readable tag and
cost-group manifest is [cost-allocation-tags.json](cost-allocation-tags.json).

## Handler bundles

Built to `apps/api/dist/handlers/<name>.cjs` via `npm run build:lambdas`.

| Lambda name | Handler file | Routes |
|-------------|--------------|--------|
| `health` | `health.cjs` | `GET /health` |
| `auth-signup` | `auth-signup.cjs` | `POST /auth/signup` |
| `auth-login` | `auth-login.cjs` | `POST /auth/login` |
| `auth-me` | `auth-me.cjs` | `GET /auth/me` |
| `auth-verify-email` | `auth-verify-email.cjs` | `POST /auth/verify-email` |
| `auth-refresh` | `auth-refresh.cjs` | `POST /auth/refresh` |
| `auth-logout` | `auth-logout.cjs` | `POST /auth/logout` |
| `auth-forgot-password` | `auth-forgot-password.cjs` | `POST /auth/forgot-password` |
| `auth-reset-password` | `auth-reset-password.cjs` | `POST /auth/reset-password` |
| `auth-resend-verification` | `auth-resend-verification.cjs` | `POST /auth/resend-verification` |
| `tenant-me` | `tenant-me.cjs` | `GET/PATCH /api/v1/tenants/me` |
| `tenant-config` | `tenant-config.cjs` | `GET/PATCH /api/v1/tenants/me/config` |
| `tenant-limits` | `tenant-limits.cjs` | `GET /api/v1/tenants/me/limits` |
| `onboarding` | `onboarding.cjs` | `GET /api/v1/onboarding`, `PATCH /api/v1/onboarding/step` |
| `onboarding-test-chat` | `onboarding-test-chat.cjs` | `POST /api/v1/onboarding/test-chat` |
| `knowledge-sources` | `knowledge-sources.cjs` | `GET/POST/DELETE /api/v1/knowledge/sources` |
| `knowledge-sync` | `knowledge-sync.cjs` | `POST /api/v1/knowledge/sources/{id}/sync` |
| `knowledge-jobs` | `knowledge-jobs.cjs` | `GET /api/v1/knowledge/jobs`, `GET /api/v1/knowledge/jobs/{jobId}` |
| `jwt-authorizer` | `jwt-authorizer.cjs` | API Gateway authorizer |

**Status (2026-06-15):** 40+ handler bundles · **~74 API routes** on AWS dev (widget script on CDN, not API GW when `WIDGET_CDN_URL` set).

**AWS dev URLs:** API `https://fimfx57xwl.execute-api.us-east-1.amazonaws.com` · Admin `https://d3g8dfkodwqrza.cloudfront.net` · Widget `https://dtm79sin0m5bg.cloudfront.net/widget/v1.js` · Vectors `commercechat-dev-vectors`

Deploy via `npm run deploy:aws:full` or individual scripts below. Inventories under `infra/deployments/`.

| npm script | What it does |
|------------|--------------|
| `ensure:deploy-iam` | Create/update `CommerceChatDeploy` policy from `aws-deploy-iam-policy.json` |
| `deploy:aws` | API CloudFormation stack |
| `deploy:widget` | Widget `v1.js` → S3 + CloudFront (`widget-cdn`) |
| `deploy:aws:full` | `--ensure-iam --with-ingest-pipeline --with-ingest-step-functions --with-widget-cdn` |
| `deploy:admin` | Static admin → S3 + CloudFront |

**Remaining Lambdas:** see [docs/implementation/06-api-implementation-status.md](../docs/implementation/06-api-implementation-status.md).

## Environment variables (all Lambdas)

| Variable | Description |
|----------|-------------|
| `TABLE_NAME` | DynamoDB table |
| `JWT_SECRET` | Strong signing secret value |
| `JWT_ISSUER` | `commercechat.com` |
| `APP_URL` | Admin app URL for email links |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | Zoho (or other) SMTP — set in `apps/api/.env`; deploy script loads them automatically |

## AWS deploy

```bash
# Full stack: IAM policy + API + ingest SQS + Step Functions + EventBridge crons
npm run deploy:aws:full -- --credentials-csv="/path/to/accessKeys.csv" --env=dev --region=us-east-1

# API only
npm run deploy:aws -- --credentials-csv="/path/to/accessKeys.csv" --env=dev --region=us-east-1

# Admin UI (stack commercechat-{env}-admin)
npm run deploy:admin -- --credentials-csv="/path/to/accessKeys.csv" --env=dev \
  --api-url=https://YOUR_API_GATEWAY_URL
```

IAM: `npm run ensure:deploy-iam` or `--ensure-iam` on deploy. Policy: [aws-deploy-iam-policy.json](aws-deploy-iam-policy.json). Full guide: [aws-serverless-deployment.md](aws-serverless-deployment.md).

## Local dev

```bash
docker compose up -d          # LocalStack DynamoDB
npm run dev:api               # Lambda handlers locally on :3001
```

Copy `apps/api/.env.example` → `apps/api/.env`.
