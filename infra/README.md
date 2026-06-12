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

**Status (2026-06-12):** 39 handler bundles. Deploy to AWS via `npm run deploy:aws` (API + DynamoDB + S3 + API Gateway). Admin UI via `npm run deploy:admin` (static Next export → S3 + CloudFront). Inventories under `infra/deployments/`.

**Remaining Lambdas:** see [docs/implementation/06-api-implementation-status.md](../docs/implementation/06-api-implementation-status.md).

## Environment variables (all Lambdas)

| Variable | Description |
|----------|-------------|
| `TABLE_NAME` | DynamoDB table |
| `JWT_SECRET` | Secrets Manager ARN or value |
| `JWT_ISSUER` | `commercechat.com` |
| `APP_URL` | Admin app URL for email links |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | Zoho (or other) SMTP — set in `apps/api/.env`; deploy script loads them automatically |

## AWS deploy

```bash
# API (CloudFormation stack commercechat-{env})
npm run deploy:aws -- --credentials-csv="/path/to/accessKeys.csv" --env=dev --region=us-east-1

# Admin UI (stack commercechat-{env}-admin)
npm run deploy:admin -- --credentials-csv="/path/to/accessKeys.csv" --env=dev \
  --api-url=https://YOUR_API_GATEWAY_URL
```

IAM: attach [aws-deploy-iam-policy.json](aws-deploy-iam-policy.json) as a **customer-managed policy** (inline limit is 2 KB). Full guide: [aws-serverless-deployment.md](aws-serverless-deployment.md).

## Local dev

```bash
docker compose up -d          # LocalStack DynamoDB
npm run dev:api               # Lambda handlers locally on :3001
```

Copy `apps/api/.env.example` → `apps/api/.env`.
