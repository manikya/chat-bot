# AWS Serverless Deployment Prep

This is the deployment baseline for CommerceChat so every AWS asset is identifiable and costs can be grouped by product area.

## Goals

- Deploy the MVP without EC2, ECS, RDS, or NAT Gateway.
- Make all AWS resources searchable by name and tags.
- Make Cost Explorer reports useful from day one.
- Keep tenant-level cost/profitability in app metrics, not high-cardinality AWS tags.

## Environments

| Environment | Region | AWS Account |
|-------------|--------|-------------|
| `dev` | `us-east-1` | separate dev account preferred |
| `staging` | `us-east-1` | separate staging account preferred |
| `prod` | `us-east-1` | separate prod account required before launch |

## Resource Naming

Use:

```text
commercechat-{env}-{component}-{name}
```

Examples:

| Resource | Name |
|----------|------|
| HTTP API | `commercechat-prod-api-http` |
| DynamoDB table | `commercechat-prod-storage-main` |
| Widget bucket | `commercechat-prod-widget-assets` |
| Chat Lambda | `commercechat-prod-chat-api` |
| Meta webhook Lambda | `commercechat-prod-meta-webhook` |
| Ingest state machine | `commercechat-prod-ingest-pipeline` |

## Required Tags

Apply these tags to every taggable resource:

| Tag | Example | Purpose |
|-----|---------|---------|
| `Project` | `CommerceChat` | top-level app filter |
| `Application` | `commercechat` | stable lowercase app key |
| `Environment` | `prod` | dev/staging/prod grouping |
| `ManagedBy` | `cdk` | ownership/audit |
| `Owner` | `platform` | team owner |
| `Component` | `chat` | operational grouping |
| `CostGroup` | `chat-runtime` | billing grouping |
| `DataClass` | `customer` | data governance |

Do not tag resources with tenant IDs, customer names, phone numbers, emails, or secrets.

## Cost Groups

| CostGroup | Includes |
|-----------|----------|
| `core-api` | API Gateway, auth/tenant/team/config Lambdas |
| `admin-web` | Admin CloudFront, admin S3 assets, app DNS/cert |
| `widget-cdn` | Widget CloudFront, widget S3 assets, widget API routes |
| `chat-runtime` | Chat API/orchestrator, conversation/cart work, chat logs |
| `knowledge-ingest` | Crawler/parser/embedder, Step Functions, ingest queues, vectors |
| `meta-channels` | Meta webhooks, sender functions, token refresh, Meta secrets |
| `billing` | Billing APIs, payment webhook, payment secrets |
| `storage` | DynamoDB, S3 data/assets, backups/PITR |
| `observability` | CloudWatch logs, dashboards, alarms, SNS alerts |
| `security` | WAF, KMS, shared Secrets Manager, SSM parameters |

The machine-readable manifest is [cost-allocation-tags.json](cost-allocation-tags.json).

## CDK Tagging Rule

When CDK is added, tag at app/stack scope and override `Component`, `CostGroup`, and `DataClass` per construct:

```ts
Tags.of(app).add("Project", "CommerceChat");
Tags.of(app).add("Application", "commercechat");
Tags.of(app).add("Environment", env);
Tags.of(app).add("ManagedBy", "cdk");
Tags.of(app).add("Owner", "platform");
```

Every stack should fail review if a taggable resource is missing `CostGroup`.

## AWS Billing Setup

1. In AWS Billing and Cost Management, activate these user-defined cost allocation tags:
   `Project`, `Application`, `Environment`, `Component`, `CostGroup`, `Owner`, `ManagedBy`, `DataClass`.
2. Expect tags to take up to 24 hours before they appear in Billing/Cost Explorer.
3. Create saved Cost Explorer reports:
   - Filter `Project = CommerceChat`, group by tag `CostGroup`.
   - Filter `Project = CommerceChat`, group by `Service`.
   - Filter `Project = CommerceChat` and `Environment = prod`, group by tag `CostGroup`.
4. Add an AWS Budget for each environment.
5. Add anomaly detection scoped to `Project = CommerceChat`.

## CLI Cost Report

After the tags are active and the AWS CLI is configured:

```bash
npm run cost:aws
npm run cost:aws -- --env=prod
npm run cost:aws -- --start=2026-06-01 --end=2026-07-01 --env=staging
```

The report prints costs grouped by `CostGroup` and by AWS service.

## Cost Drivers To Watch

| Area | Main Driver | Control |
|------|-------------|---------|
| `chat-runtime` | Lambda duration, API calls, CloudWatch logs | shorter prompts, log retention, alarms |
| `knowledge-ingest` | embeddings, crawler duration, vector storage | per-plan source/vector caps |
| `storage` | DynamoDB writes/reads, S3 objects, PITR | TTL, source limits, lifecycle rules |
| `widget-cdn` | CloudFront requests and transfer | cache widget bundle, compact assets |
| `meta-channels` | webhook volume, logs | idempotency and log retention |
| `observability` | logs, metrics, dashboards, alarms | 14-30 day log retention for non-prod |

## First Serverless Stack Order

1. `storage`: DynamoDB table, S3 data/assets buckets, KMS keys.
2. `security`: Secrets Manager/SSM paths, IAM baseline.
3. `api`: API Gateway HTTP API, auth/tenant/widget/chat Lambdas.
4. `meta`: Meta webhook route, token refresh schedule.
5. `ingest`: knowledge sync Lambdas, queues, Step Functions.
6. `web`: admin/widget CloudFront distributions.
7. `observability`: dashboards, alarms, budgets/anomaly detection.

## Deployment Readiness Checklist

- [ ] CDK app scaffolded with environment context.
- [ ] Required tags applied at app/stack scope.
- [ ] `CostGroup` overrides added to each stack/construct group.
- [ ] User-defined cost allocation tags activated in Billing.
- [ ] Log retention set explicitly for every Lambda log group.
- [ ] No Lambda is placed in a VPC unless required.
- [ ] DynamoDB PITR enabled for prod.
- [ ] S3 lifecycle rules added for raw ingest files and logs.
- [ ] WAF associated with API/CloudFront before public launch.
- [ ] AWS Budgets and anomaly detection configured before prod traffic.
