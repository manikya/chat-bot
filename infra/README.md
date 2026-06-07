# Infrastructure

Lambda deployment map for API Gateway HTTP API.

## Handler bundles

Built to `apps/api/dist/handlers/<name>.cjs` via `npm run build:lambdas`.

| Lambda name | Handler file | Routes |
|-------------|--------------|--------|
| `health` | `health.cjs` | `GET /health` |
| `auth-signup` | `auth-signup.cjs` | `POST /auth/signup` |
| `auth-login` | `auth-login.cjs` | `POST /auth/login` |
| `auth-me` | `auth-me.cjs` | `GET /auth/me` |
| `auth-verify-email` | `auth-verify-email.cjs` | `POST /auth/verify-email` |
| `tenant-me` | `tenant-me.cjs` | `GET/PATCH /api/v1/tenants/me` |
| `tenant-config` | `tenant-config.cjs` | `GET/PATCH /api/v1/tenants/me/config` |
| `tenant-limits` | `tenant-limits.cjs` | `GET /api/v1/tenants/me/limits` |
| `jwt-authorizer` | `jwt-authorizer.cjs` | API Gateway authorizer |

**Remaining Lambdas:** see [docs/implementation/06-api-implementation-status.md](../docs/implementation/06-api-implementation-status.md).

## Environment variables (all Lambdas)

| Variable | Description |
|----------|-------------|
| `TABLE_NAME` | DynamoDB table |
| `JWT_SECRET` | Secrets Manager ARN or value |
| `JWT_ISSUER` | `commercechat.com` |
| `APP_URL` | Admin app URL for email links |

## Local dev

```bash
docker compose up -d          # LocalStack DynamoDB
npm run dev:api               # Lambda handlers locally on :3001
```

Copy `apps/api/.env.example` → `apps/api/.env`.
