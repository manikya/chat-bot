# Function Spec: AWS Infrastructure

**Parent:** [00-MASTER-ARCHITECTURE.md](../00-MASTER-ARCHITECTURE.md)  
**Version:** 1.0

---

## 1. Purpose

Define AWS services, networking, IAM, deployment, and observability for the CommerceChat SaaS platform.

---

## 2. Region and environments

| Environment | Region | Purpose |
|-------------|--------|---------|
| `dev` | us-east-1 | Development |
| `staging` | us-east-1 | Pre-production, Meta test app |
| `prod` | us-east-1 | Production |

Single region MVP; multi-region Phase 3 for enterprise.

---

## 3. Service inventory

| Service | Resource | Purpose |
|---------|----------|---------|
| CloudFront | `cdn.commercechat.com` | Widget CDN, admin static assets |
| WAF | Web ACL on CloudFront + API GW | Rate limit, bot control |
| API Gateway | HTTP API `commercechat-api` | All REST endpoints |
| Lambda | 15+ functions | Compute |
| SQS | FIFO `inbound-messages`, `outbound-messages` | Message queues |
| SQS | Standard `ingest-jobs` | Ingestion queue |
| SQS | DLQ per queue | Failed message handling |
| Step Functions | `ingest-pipeline` | Knowledge ingestion workflow |
| DynamoDB | `CommerceChat-Main` | All application data |
| S3 | `commercechat-data` | Raw files, media |
| S3 | `commercechat-assets` | Widget bundles, admin build |
| S3 Vectors | Per-tenant indexes | Vector search |
| KMS | JWT signing + TOTP secret encryption | Custom auth — [13-custom-auth.md](13-custom-auth.md) |
| Secrets Manager | `/commercechat/*` | API keys, Meta tokens |
| SSM Parameter Store | `/commercechat/config/*` | Non-secret config, pricing table |
| EventBridge | Rules + Scheduler | Token refresh, re-crawl, analytics |
| Resend | External API | Auth + platform email (primary) |
| SES | Verified domain (optional) | EmailProvider fallback |
| SNS | `commercechat-alerts` | Ops alerts |
| CloudWatch | Logs, metrics, alarms | Observability |
| X-Ray | Tracing | Distributed tracing (Phase 2) |
| IAM | Roles per Lambda | Least privilege |
| Route 53 | `commercechat.com` | DNS |
| ACM | TLS certificates | HTTPS |

**Not used in v1:** OpenSearch Serverless, RDS, ECS, NAT Gateway (avoid VPC for Lambdas unless required).

---

## 4. API Gateway routes

| Method | Path | Lambda | Auth |
|--------|------|--------|------|
| GET/POST | `/webhooks/meta` | webhook-meta-receiver | Signature |
| POST | `/api/v1/chat` | chat-api | API key |
| GET | `/api/v1/widget/config` | widget-config | API key |
| POST | `/api/v1/tenants` | tenant-create | None |
| POST | `/auth/*` | auth-* | Public / JWT |
| GET/PATCH | `/api/v1/tenants/me/*` | tenant-* | JWT authorizer |
| POST | `/api/v1/channels/meta/*` | meta-connect | JWT authorizer |
| POST | `/api/v1/ingest/*` | ingest-api | JWT authorizer |
| GET | `/api/v1/admin/*` | admin-* | JWT authorizer |
| POST | `/api/v1/billing/*` | billing-* | JWT authorizer |
| POST | `/webhooks/stripe` | stripe-webhook | Stripe sig |

---

## 5. Lambda functions (complete list)

| Function | Memory | Timeout | Trigger |
|----------|--------|---------|---------|
| `webhook-meta-receiver` | 256 MB | 10s | API GW |
| `chat-orchestrator` | 1024 MB | 60s | SQS inbound FIFO |
| `channel-sender-meta` | 512 MB | 30s | SQS outbound |
| `chat-api` | 1024 MB | 60s | API GW |
| `widget-config` | 256 MB | 5s | API GW |
| `auth-signup` | 512 MB | 15s | API GW |
| `auth-login` | 512 MB | 10s | API GW |
| `auth-mfa-verify` | 256 MB | 10s | API GW (Phase 2) |
| `auth-refresh` | 256 MB | 10s | API GW |
| `jwt-authorizer` | 256 MB | 5s | API GW authorizer |
| `tenant-config` | 256 MB | 10s | API GW |
| `meta-connect` | 512 MB | 30s | API GW |
| `meta-token-refresh` | 256 MB | 60s | EventBridge daily |
| `ingest-api` | 256 MB | 10s | API GW |
| `ingest-*` (6 steps) | 512–1024 MB | 300s | Step Functions |
| `ingest-scheduler` | 256 MB | 60s | EventBridge weekly |
| `stripe-webhook` | 256 MB | 10s | API GW |
| `admin-*` (4 functions) | 512 MB | 15s | API GW |
| `notification-service` | 256 MB | 15s | Internal / SQS |
| `notify-ingest-failed` | 256 MB | 10s | Step Functions |
| `notify-meta-token-expired` | 256 MB | 10s | EventBridge |
| `media-fetcher` | 512 MB | 30s | Internal |

---

## 6. SQS configuration

### `inbound-messages` (FIFO)

| Setting | Value |
|---------|-------|
| MessageGroupId | `{tenantId}#{conversationId}` |
| Visibility timeout | 90s |
| Max receive count | 3 → DLQ |
| Batch size (Lambda) | 1 |

### `outbound-messages` (standard)

| Setting | Value |
|---------|-------|
| Visibility timeout | 60s |
| Max receive count | 3 → DLQ |

---

## 7. DynamoDB configuration

| Setting | Value |
|---------|-------|
| Billing | On-demand |
| PITR | Enabled (prod) |
| TTL | Enabled on `MSG#*` and `CART#*` records |
| Streams | Enabled → analytics processor (Phase 2) |

---

## 8. IAM roles (examples)

### `chat-orchestrator-role`

```json
{
  "Effect": "Allow",
  "Action": [
    "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:Query",
    "sqs:SendMessage", "sqs:ReceiveMessage", "sqs:DeleteMessage",
    "secretsmanager:GetSecretValue",
    "bedrock:InvokeModel", "bedrock:Converse"
  ],
  "Resource": ["specific ARNs only"]
}
```

### `webhook-meta-receiver-role`

```json
{
  "Effect": "Allow",
  "Action": ["sqs:SendMessage", "dynamodb:Query", "dynamodb:PutItem"],
  "Resource": ["specific ARNs only"]
}
```

---

## 9. Infrastructure as Code

**Recommended:** AWS CDK (TypeScript)

```
infrastructure/
  bin/app.ts
  lib/
    api-stack.ts
    compute-stack.ts
    data-stack.ts
    cdn-stack.ts
    auth-stack.ts
    monitoring-stack.ts
```

### Deployment pipeline

```
GitHub → GitHub Actions → CDK deploy (staging) → manual approve → CDK deploy (prod)
```

---

## 10. Observability

### CloudWatch alarms

| Alarm | Threshold |
|-------|-----------|
| DLQ message count | > 0 |
| Orchestrator error rate | > 5% in 5 min |
| API Gateway 5xx | > 10 in 5 min |
| Webhook latency p99 | > 500ms |
| DynamoDB throttling | > 0 |

### Dashboards

- Platform overview (messages/min, errors, latency)
- Per-tenant usage (top 10 by volume)
- LLM cost (tokens/day by provider)
- Ingest job success rate

### Structured logging

All Lambdas use JSON logs:
```json
{ "level": "info", "service": "chat-orchestrator", "tenantId": "...", "correlationId": "..." }
```

---

## 11. Cost allocation tags

| Tag | Example |
|-----|---------|
| `Project` | CommerceChat |
| `Environment` | prod |
| `Tenant` | shared (not per-tenant; use metrics for that) |

---

## 12. DNS layout

| Record | Target |
|--------|--------|
| `api.commercechat.com` | API Gateway |
| `cdn.commercechat.com` | CloudFront (widget) |
| `app.commercechat.com` | CloudFront (admin) |
| `checkout.commercechat.com` | API Gateway (checkout page) |

---

## 13. Estimated monthly AWS cost (platform)

| Scale | AWS infra (excl. LLM) |
|-------|----------------------|
| 10 tenants, 30K msgs | ~$50–80 |
| 50 tenants, 300K msgs | ~$150–250 |
| LLM (OpenAI, separate bill) | ~$100–1,500 |

---

## 14. Deployment checklist

- [ ] CDK stacks deploy to staging
- [ ] All Lambdas have correct IAM roles
- [ ] SQS DLQ alarms configured
- [ ] JWT signing key in Secrets Manager / KMS
- [ ] Auth signup/login flow tested
- [ ] ACM certificates validated
- [ ] CloudFront distributions serving widget
- [ ] Secrets Manager secrets created (manual first time)
- [ ] WAF rules attached
- [ ] Route 53 records pointing to CloudFront/API GW
- [ ] Meta webhook URL registered in Meta App
