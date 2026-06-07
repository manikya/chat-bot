# Function Spec: SaaS Tenant Platform

**Parent:** [00-MASTER-ARCHITECTURE.md](../00-MASTER-ARCHITECTURE.md)  
**Version:** 1.1  
**Owner:** Platform team

---

## 1. Purpose

Provide multi-tenant foundations: merchant accounts, tenant configuration, data isolation, and feature flags that all other functions depend on.

---

## 2. Scope

### In scope

- Tenant registration and lifecycle (trial, active, suspended, deleted)
- Merchant authentication via **DynamoDB users + JWT** (see [13-custom-auth.md](13-custom-auth.md))
- Tenant profile and configuration storage
- Per-tenant feature flags and plan limits
- Tenant resolution for inbound webhooks and API calls
- Data isolation enforcement

### Out of scope

- Customer (shopper) authentication — shoppers are identified by channel IDs
- MFA implementation in MVP (schema ready; see doc 13)
- Payment processing logic — see [09-billing-usage.md](09-billing-usage.md)
- Channel connection UI — see [08-admin-dashboard.md](08-admin-dashboard.md)

---

## 3. Tenant lifecycle

```
signup → trial → active → (suspended | cancelled) → deleted
```

| State | Description | Platform behavior |
|-------|-------------|-------------------|
| `trial` | 14-day trial, limited quota | Full features, usage capped |
| `active` | Paid subscription | Full plan features |
| `suspended` | Payment failed or ToS violation | Inbound messages get auto-reply "service unavailable"; no AI |
| `cancelled` | Merchant cancelled | Read-only admin 30 days, then delete scheduled |
| `deleted` | GDPR erasure complete | All tenant data removed |

---

## 4. Authentication

Merchant auth is documented in **[13-custom-auth.md](13-custom-auth.md)**. Summary:

| Item | Spec |
|------|------|
| User store | DynamoDB `TENANT#<id> / USER#<userId>` |
| Sessions | DynamoDB `SESSION#<sessionId>` |
| Roles | `owner`, `admin`, `viewer` |
| API auth | JWT via Lambda authorizer |
| MFA | **Off in MVP**; TOTP + email OTP in Phase 2; SMS in Phase 3 |
| Auth emails | Resend — [12-notifications-email-sms.md](12-notifications-email-sms.md) |
| Invitation | Owner invites team members scoped to same tenant |

### API key auth (widget + server)

| Item | Spec |
|------|------|
| Widget key | Per-tenant public key embedded in script tag |
| Validation | API Gateway Lambda authorizer checks key → resolves tenantId |
| Rotation | Merchant can rotate from admin; 24h grace period on old key |

---

## 5. DynamoDB schema

### Table: `CommerceChat-Main`

| PK | SK | Attributes | Purpose |
|----|-----|------------|---------|
| `TENANT#<id>` | `PROFILE` | name, email, plan, status, createdAt, timezone | Tenant identity |
| `TENANT#<id>` | `CONFIG` | llmConfig, prompts, enabledChannels, commerceConnector | Runtime config |
| `TENANT#<id>` | `LIMITS` | maxMessages, maxSources, maxStorageMb | Plan enforcement |
| `TENANT#<id>` | `USER#<userId>` | email, role, passwordHash, mfa, status | Team members — see doc 13 |
| `TENANT#<id>` | `SESSION#<sessionId>` | refreshTokenHash, mfaVerified, expiresAt | Auth sessions |

### GSI: `GSI-WebhookRouting`

| GSI-PK | GSI-SK | Maps to |
|--------|--------|---------|
| `PAGE#<pageId>` | `TENANT` | tenantId (Messenger) |
| `PHONE#<phoneNumberId>` | `TENANT` | tenantId (WhatsApp) |
| `IG#<igUserId>` | `TENANT` | tenantId (Instagram) |
| `APIKEY#<hash>` | `TENANT` | tenantId (widget) |

### GSI: `GSI-EmailLookup`

| GSI-PK | Maps to |
|--------|---------|
| `EMAIL#<normalizedEmail>` | tenantId + userId (login) |

---

## 6. Tenant configuration object

```json
{
  "tenantId": "ten_abc123",
  "profile": {
    "storeName": "Acme Shoes",
    "timezone": "America/New_York",
    "defaultLanguage": "en"
  },
  "llmConfig": {
    "primaryProvider": "openai",
    "fallbackProvider": "bedrock",
    "models": {
      "faq": "gpt-4.1-nano",
      "product": "gpt-4o-mini",
      "checkout": "gpt-4.1-mini"
    },
    "embeddingModel": "text-embedding-3-small"
  },
  "prompts": {
    "systemPrompt": "You are a helpful sales assistant for {{storeName}}...",
    "greeting": "Hi! How can I help you shop today?",
    "handoffMessage": "Let me connect you with our team."
  },
  "enabledChannels": ["whatsapp", "messenger", "instagram", "web"],
  "commerceConnector": {
    "type": "shopify | woocommerce | manual",
    "status": "connected | disconnected"
  },
  "featureFlags": {
    "conversationIngest": true,
    "socialIngest": false,
    "humanHandoff": false,
    "mfaAvailable": false
  }
}
```

`mfaAvailable` flips to `true` in Phase 2 when TOTP/email MFA ships.

---

## 7. APIs

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/signup` | Public | Create tenant + owner user — see doc 13 |
| GET | `/api/v1/tenants/me` | JWT | Get current tenant profile |
| PATCH | `/api/v1/tenants/me/config` | JWT (owner/admin) | Update config |
| DELETE | `/api/v1/tenants/me` | JWT (owner) | Request deletion |
| GET | `/api/v1/tenants/me/usage` | JWT | Current period usage |

---

## 8. Isolation rules

1. Every Lambda receives `tenantId` from JWT authorizer or webhook resolver — never from unvalidated client input alone
2. All DynamoDB queries include `TENANT#<id>` partition key
3. S3 paths: `s3://bucket/<tenantId>/...`
4. S3 Vectors index namespace: `tenant-<tenantId>`
5. Secrets path: `/commercechat/<tenantId>/meta`, `/commercechat/<tenantId>/commerce`
6. CloudWatch logs include `tenantId` structured field
7. Integration tests must include cross-tenant access negative cases

---

## 9. Lambda functions

| Function | Trigger | Responsibility |
|----------|---------|----------------|
| `auth-signup` | API Gateway | Create tenant + user — see doc 13 |
| `tenant-config` | API Gateway GET/PATCH | Read/update config with validation |
| `tenant-resolve` | Internal | Webhook GSI lookup |
| `tenant-delete` | Step Functions | Cascade delete all tenant resources |
| `jwt-authorizer` | API Gateway | Validate JWT; inject tenantId + role |

---

## 10. Validation rules

| Field | Rule |
|-------|------|
| `storeName` | 2–100 chars |
| `systemPrompt` | Max 4000 chars |
| `enabledChannels` | Subset of allowed channels for plan |
| `llmConfig.models` | Must be in allowed model list for plan |
| Plan limits | Enforced before ingest job start and message processing |

---

## 11. Error handling

| Code | Scenario |
|------|----------|
| `TENANT_NOT_FOUND` | Invalid tenantId |
| `TENANT_SUSPENDED` | Messaging blocked |
| `PLAN_LIMIT_EXCEEDED` | Message or storage quota hit |
| `UNAUTHORIZED_ROLE` | Viewer attempting write |
| `EMAIL_NOT_VERIFIED` | Login before verify |
| `MFA_REQUIRED` | Step 2 needed (Phase 2) |
| `ACCOUNT_LOCKED` | Too many failed logins |

---

## 12. Dependencies

| Depends on | Provides to |
|------------|-------------|
| DynamoDB, Secrets Manager | All admin functions |
| [13 Custom Auth](13-custom-auth.md) | JWT, sessions, MFA |
| [12 Notifications](12-notifications-email-sms.md) | Verify/reset emails |
| Stripe (status sync) | Billing function |
| — | Channel integration, orchestrator, admin, billing |

---

## 13. Testing checklist

- [ ] Signup creates tenant + user in one transaction
- [ ] User A cannot read User B tenant data
- [ ] Webhook routing resolves correct tenant for each Meta ID type
- [ ] Suspended tenant blocks AI processing
- [ ] Config update validates plan limits
- [ ] JWT authorizer enforces role permissions
- [ ] MFA schema present on user record (`mfa.enabled: false` in MVP)
