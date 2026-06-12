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

## Deploy From Local Credentials CSV

Use the checked-in deployment script instead of creating resources manually. It builds Lambda bundles,
uploads versioned artifacts to a tagged deployment bucket, deploys a CloudFormation stack, and writes a
resource inventory under `infra/deployments/`.

The IAM user/access key needs the permissions in [aws-deploy-iam-policy.json](aws-deploy-iam-policy.json).
Attach that JSON as a **customer-managed IAM policy** on the deploy user before running deploy.
Inline user policies are limited to 2,048 bytes; this file is ~3 KB, so use:

```bash
aws iam create-policy --policy-name CommerceChatDeploy \
  --policy-document file://infra/aws-deploy-iam-policy.json
aws iam attach-user-policy --user-name YOUR_USER \
  --policy-arn arn:aws:iam::ACCOUNT_ID:policy/CommerceChatDeploy
```
The script runs IAM **preflight checks first** (before building Lambda bundles) so missing permissions fail fast.

If deployment fails before the CloudFormation stack is created, the script may still have created the
deployment artifact bucket; record or remove it using the generated partial inventory file under
`infra/deployments/`.

### Known dev deploy failures (account `960884446408`)

| When | Status | Root cause |
|------|--------|------------|
| 2026-06-12 03:41 UTC | `partial-failed-before-cloudformation` | IAM user had **no policy attached** — missing `cloudformation:CreateChangeSet` |
| 2026-06-12 05:26 UTC | `ROLLBACK_COMPLETE` | Same user still lacked **`dynamodb:DescribeTable`** when CloudFormation created `MainTable`; all other resources rolled back |

Fix: attach [aws-deploy-iam-policy.json](aws-deploy-iam-policy.json), delete the failed stack (or use `--delete-failed-stack`), then redeploy.

```bash
npm run deploy:aws -- --credentials-csv="/Users/manikya/Downloads/manikya_accessKeys (1).csv" --env=dev --region=us-east-1
```

Preflight only (no build/upload):

```bash
npm run deploy:aws -- --preflight-only --credentials-csv="/Users/manikya/Downloads/manikya_accessKeys (1).csv" --env=dev
```

Retry after a failed stack without manual delete:

```bash
npm run deploy:aws -- --delete-failed-stack --credentials-csv="..." --env=dev --region=us-east-1
```

Optional parameters:

```bash
npm run deploy:aws -- \
  --credentials-csv="/Users/manikya/Downloads/manikya_accessKeys (1).csv" \
  --env=dev \
  --region=us-east-1 \
  --app-url=https://your-admin-url.example.com \
  --openai-api-key="$OPENAI_API_KEY" \
  --meta-app-id="$META_APP_ID" \
  --meta-app-secret="$META_APP_SECRET" \
  --meta-verify-token="$META_VERIFY_TOKEN"
```

Removal is intentionally simple:

```bash
aws cloudformation delete-stack --stack-name commercechat-dev --region us-east-1
aws cloudformation wait stack-delete-complete --stack-name commercechat-dev --region us-east-1
```

The deployment artifact bucket is outside the stack so CloudFormation can read Lambda code from it.
The generated inventory file includes the exact `aws s3 rm` and `aws s3 rb` commands for that bucket.

## Deploy Admin UI (S3 + CloudFront static export)

The merchant dashboard is a **static Next.js export** (`NEXT_STATIC_EXPORT=1`) synced to S3 and served via CloudFront.

```bash
npm run deploy:admin -- \
  --credentials-csv="/Users/manikya/Downloads/manikya_accessKeys (1).csv" \
  --env=dev \
  --region=us-east-1 \
  --api-url=https://YOUR_API_GATEWAY_URL
```

`--api-url` defaults to the latest successful API inventory under `infra/deployments/` if omitted.

After deploy:

1. Open the printed **Admin URL** (CloudFront).
2. Add **Meta OAuth redirect**: `{AdminUrl}/channels/meta/callback/`
3. Update Lambda **`AppUrl`** parameter (redeploy API or set in console) to the Admin URL for verify-email links.

Stack name: `commercechat-{env}-admin` · Cost group: `admin-web`

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
