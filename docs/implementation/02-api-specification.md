# API Specification

**Parent:** [00-MASTER-ARCHITECTURE.md](../00-MASTER-ARCHITECTURE.md)  
**Version:** 1.0  
**Base URL (prod):** `https://api.commercechat.com`  
**Base URL (local):** `http://localhost:3001`

> **Implementation status:** See [06-api-implementation-status.md](06-api-implementation-status.md) for which routes are live (Lambda + DynamoDB) vs mock-only vs not started.

---

## 1. Conventions

### 1.1 Authentication


| Type           | Header                                | Used on                        |
| -------------- | ------------------------------------- | ------------------------------ |
| JWT Bearer     | `Authorization: Bearer <accessToken>` | Admin / tenant APIs            |
| Widget API key | `X-API-Key: pk_live_<key>`            | Widget chat + config           |
| None           | —                                     | Public webhooks, signup, login |
| Meta signature | `X-Hub-Signature-256`                 | Meta webhook POST              |


### 1.2 Standard response envelope

**Success:**

```json
{
  "success": true,
  "message": "Optional human message",
  "data": {},
  "timestamp": "2026-06-10T09:15:00.000Z"
}
```

**Error:**

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email is required",
    "details": [{ "field": "email", "message": "Required" }]
  },
  "timestamp": "2026-06-10T09:15:00.000Z"
}
```

### 1.3 HTTP status codes


| Code | When                                    |
| ---- | --------------------------------------- |
| 200  | Success (GET, PATCH, DELETE)            |
| 201  | Created (POST)                          |
| 204  | No content (logout)                     |
| 400  | Validation / bad request                |
| 401  | Missing or invalid auth                 |
| 403  | Forbidden (role / tenant)               |
| 404  | Resource not found                      |
| 409  | Conflict (duplicate email, idempotency) |
| 422  | Business rule violation                 |
| 429  | Rate limited                            |
| 500  | Server error                            |


### 1.4 Error codes


| Code                    | HTTP                          |
| ----------------------- | ----------------------------- |
| `VALIDATION_ERROR`      | 400                           |
| `UNAUTHORIZED`          | 401                           |
| `INVALID_CREDENTIALS`   | 401                           |
| `TOKEN_EXPIRED`         | 401                           |
| `FORBIDDEN`             | 403                           |
| `NOT_FOUND`             | 404                           |
| `EMAIL_EXISTS`          | 409                           |
| `LIMIT_EXCEEDED`        | 422                           |
| `CHANNEL_NOT_CONNECTED` | 422                           |
| `MFA_REQUIRED`          | 200 (login step 1 — see auth) |
| `RATE_LIMITED`          | 429                           |


### 1.5 Pagination

Query params: `?limit=20&cursor=<opaque>`

```json
{
  "success": true,
  "data": {
    "items": [],
    "nextCursor": "eyJ...",
    "hasMore": true
  }
}
```

### 1.6 ID formats


| Entity       | Prefix  | Example       |
| ------------ | ------- | ------------- |
| Tenant       | `ten_`  | `ten_abc123`  |
| User         | `usr_`  | `usr_def456`  |
| Session      | `sess_` | `sess_ghi789` |
| Conversation | `conv_` | `conv_jkl012` |
| Message      | `msg_`  | `msg_pqr678`  |
| Cart         | `cart_` | `cart_mno345` |
| Order        | `ord_`  | `ord_stu901`  |
| Source       | `src_`  | `src_vwx234`  |
| Job          | `job_`  | `job_yza567`  |


---

## 2. Authentication APIs

Base path: `/auth`

### 2.1 POST `/auth/signup`

Create tenant + owner user. Sends verification email via Resend.

**Auth:** None

**Request:**

```json
{
  "storeName": "Acme Shoes",
  "email": "owner@store.com",
  "password": "SecurePass123!",
  "name": "Jane Owner",
  "timezone": "America/New_York"
}
```

**Response 201:**

```json
{
  "success": true,
  "message": "Account created. Please verify your email.",
  "data": {
    "tenantId": "ten_abc123",
    "userId": "usr_def456",
    "email": "owner@store.com",
    "emailVerified": false,
    "onboardingStep": "profile"
  }
}
```

**Errors:** `EMAIL_EXISTS`, `VALIDATION_ERROR`

---

### 2.2 POST `/auth/login`

**Auth:** None

**Request:**

```json
{
  "email": "owner@store.com",
  "password": "SecurePass123!"
}
```

**Response 200 — success (MFA off):**

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "rt_abc123...",
    "expiresIn": 3600,
    "tokenType": "Bearer",
    "user": {
      "userId": "usr_def456",
      "tenantId": "ten_abc123",
      "email": "owner@store.com",
      "name": "Jane Owner",
      "role": "owner",
      "emailVerified": true,
      "mfaEnabled": false
    },
    "tenant": {
      "tenantId": "ten_abc123",
      "storeName": "Acme Shoes",
      "plan": "trial",
      "onboardingStep": "channels"
    }
  }
}
```

**Response 200 — MFA required (Phase 2):**

```json
{
  "success": true,
  "data": {
    "mfaRequired": true,
    "challengeId": "mfa_ch_abc",
    "method": "totp",
    "expiresIn": 300
  }
}
```

**Errors:** `INVALID_CREDENTIALS`, `ACCOUNT_LOCKED`, `EMAIL_NOT_VERIFIED`

---

### 2.3 POST `/auth/mfa/verify` (Phase 2)

**Request:**

```json
{
  "challengeId": "mfa_ch_abc",
  "code": "123456"
}
```

**Response 200:** Same as login success with tokens.

---

### 2.4 POST `/auth/refresh`

**Request:**

```json
{
  "refreshToken": "rt_abc123..."
}
```

**Response 200:**

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "expiresIn": 3600,
    "tokenType": "Bearer"
  }
}
```

---

### 2.5 POST `/auth/logout`

**Auth:** Bearer

**Request:**

```json
{
  "refreshToken": "rt_abc123..."
}
```

**Response:** `204 No Content`

---

### 2.6 POST `/auth/forgot-password`

**Request:**

```json
{
  "email": "owner@store.com"
}
```

**Response 200:** (always same — no email enumeration)

```json
{
  "success": true,
  "message": "If that email exists, a reset link has been sent."
}
```

---

### 2.7 POST `/auth/reset-password`

**Request:**

```json
{
  "token": "reset_token_from_email",
  "password": "NewSecurePass456!"
}
```

**Response 200:**

```json
{
  "success": true,
  "message": "Password updated successfully."
}
```

---

### 2.8 POST `/auth/verify-email`

**Request:**

```json
{
  "token": "verify_token_from_email"
}
```

**Response 200:**

```json
{
  "success": true,
  "data": {
    "emailVerified": true
  }
}
```

---

### 2.9 GET `/auth/me`

Current user + tenant summary. Used on app load to restore session and onboarding route.

**Auth:** Bearer

**Response 200:**

```json
{
  "success": true,
  "data": {
    "user": {
      "userId": "usr_def456",
      "tenantId": "ten_abc123",
      "email": "owner@store.com",
      "name": "Jane Owner",
      "role": "owner",
      "emailVerified": true,
      "mfaEnabled": false
    },
    "tenant": {
      "tenantId": "ten_abc123",
      "storeName": "Acme Shoes",
      "plan": "trial",
      "status": "trial",
      "onboardingStep": "knowledge",
      "logoUrl": "https://cdn.commercechat.com/assets/ten_abc123/logo.png"
    }
  }
}
```

---

### 2.10 POST `/auth/invite`

**Auth:** Bearer (`owner` | `admin`)

**Request:**

```json
{
  "email": "staff@store.com",
  "role": "viewer",
  "name": "Staff Member"
}
```

**Response 201:**

```json
{
  "success": true,
  "data": {
    "inviteId": "inv_xyz",
    "email": "staff@store.com",
    "role": "viewer",
    "expiresAt": "2026-06-17T10:00:00Z"
  }
}
```

---

### 2.11 POST `/auth/accept-invite`

Team member completes registration from invite email link.

**Auth:** None

**Request:**

```json
{
  "token": "invite_token_from_email",
  "password": "StaffPass123!",
  "name": "Alex Staff"
}
```

**Response 200:**

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "rt_staff123...",
    "expiresIn": 3600,
    "tokenType": "Bearer",
    "user": {
      "userId": "usr_staff01",
      "tenantId": "ten_abc123",
      "email": "staff@store.com",
      "name": "Alex Staff",
      "role": "viewer",
      "emailVerified": true
    },
    "tenant": {
      "tenantId": "ten_abc123",
      "storeName": "Acme Shoes",
      "onboardingStep": "complete"
    }
  }
}
```

**Errors:** `INVITE_EXPIRED`, `INVITE_USED`, `EMAIL_EXISTS`

---

### 2.12 POST `/auth/resend-verification`

Resend signup verification email (rate limited).

**Auth:** None

**Request:**

```json
{
  "email": "owner@store.com"
}
```

**Response 200:**

```json
{
  "success": true,
  "message": "If that email is unverified, a new link has been sent."
}
```

---

## 3. Tenant APIs

Base path: `/api/v1/tenants`  
**Auth:** Bearer

### 3.1 GET `/api/v1/tenants/me`

**Response 200:**

```json
{
  "success": true,
  "data": {
    "tenantId": "ten_abc123",
    "storeName": "Acme Shoes",
    "ownerEmail": "owner@store.com",
    "plan": "trial",
    "status": "trial",
    "timezone": "America/New_York",
    "onboardingStep": "channels",
    "createdAt": "2026-06-06T10:00:00Z"
  }
}
```

---

### 3.2 PATCH `/api/v1/tenants/me`

**Request:**

```json
{
  "storeName": "Acme Shoes NYC",
  "timezone": "America/New_York"
}
```

**Response 200:** Updated tenant object.

---

### 3.3 GET `/api/v1/tenants/me/config`

**Response 200:**

```json
{
  "success": true,
  "data": {
    "llmConfig": {
      "primaryProvider": "openai",
      "models": { "faq": "gpt-4o-mini", "product": "gpt-4o-mini", "checkout": "gpt-4o-mini" }
    },
    "prompts": {
      "systemPrompt": "You are Acme Shoes' AI assistant...",
      "greeting": "Hi! How can I help you shop today?"
    },
    "enabledChannels": ["whatsapp", "web"],
    "commerceConnector": {
      "type": "manual",
      "status": "connected",
      "checkoutBaseUrl": "https://acme-shoes.com"
    },
    "widgetConfig": {
      "primaryColor": "#4F46E5",
      "position": "bottom-right",
      "suggestedQuestions": ["Shipping info", "Best sellers"]
    }
  }
}
```

---

### 3.4 PATCH `/api/v1/tenants/me/config`

**Request:** Partial config (any subset of fields above).

**Response 200:** Full updated config.

---

### 3.5 GET `/api/v1/tenants/me/limits`

**Response 200:**

```json
{
  "success": true,
  "data": {
    "maxMessages": 2000,
    "maxSources": 3,
    "maxVectors": 10000,
    "maxTeamMembers": 1,
    "enabledChannels": ["whatsapp", "web"]
  }
}
```

---

### 3.6 GET `/api/v1/tenants/me/usage`

**Query:** `?period=2026-06` (default: current month)

**Response 200:**

```json
{
  "success": true,
  "data": {
    "period": "2026-06",
    "messages": 342,
    "inputTokens": 890000,
    "outputTokens": 120000,
    "ingestJobs": 4,
    "estimatedLlmCostUsd": 4.52,
    "limits": {
      "maxMessages": 2000,
      "messagesRemaining": 1658
    }
  }
}
```

---

### 3.7 POST `/api/v1/tenants/me/widget/regenerate-key`

**Auth:** Bearer (`owner` | `admin`)

**Response 200:**

```json
{
  "success": true,
  "data": {
    "apiKey": "pk_live_abc123onlyShownOnce",
    "prefix": "pk_live_abc",
    "createdAt": "2026-06-10T10:00:00Z"
  }
}
```

---

### 3.8 POST `/api/v1/tenants/me/logo`

Upload store logo (onboarding step 1). When `S3_BUCKET` is configured, the file is stored in S3; otherwise local dev filesystem.

**Auth:** Bearer (`owner` | `admin`)

**Request:** `multipart/form-data` — field `file` (PNG/JPG/WebP, max 2 MB)

**Response 200:**

```json
{
  "success": true,
  "data": {
    "logoUrl": "https://cdn.commercechat.com/assets/ten_abc123/logo.png",
    "updatedAt": "2026-06-06T10:30:00Z"
  }
}
```

---

### 3.9 POST `/api/v1/tenants/me/logo/presign`

Get a presigned PUT URL for direct browser → S3 upload (preferred when S3 is configured).

**Auth:** Bearer (`owner` | `admin`)

**Request:**

```json
{
  "contentType": "image/png"
}
```

**Response 200:**

```json
{
  "success": true,
  "data": {
    "uploadUrl": "https://s3.../logos/ten_abc123.png?...",
    "logoUrl": "https://cdn.../logos/ten_abc123.png",
    "key": "logos/ten_abc123.png",
    "contentType": "image/png",
    "expiresIn": 900
  }
}
```

---

### 3.10 POST `/api/v1/tenants/me/logo/complete`

Confirm presigned upload and save `logoUrl` on the tenant profile.

**Auth:** Bearer (`owner` | `admin`)

**Request:**

```json
{
  "key": "logos/ten_abc123.png"
}
```

**Response 200:** Same shape as §3.8.

---

## 4. Team APIs

Base path: `/api/v1/team`  
**Auth:** Bearer

### 4.1 GET `/api/v1/team`

**Response 200:**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "userId": "usr_def456",
        "email": "owner@store.com",
        "name": "Jane Owner",
        "role": "owner",
        "status": "active",
        "lastLoginAt": "2026-06-10T08:30:00Z"
      }
    ]
  }
}
```

---

### 4.2 PATCH `/api/v1/team/{userId}`

Change a team member's role.

**Auth:** Bearer (`owner` only)

**Request:**

```json
{
  "role": "admin"
}
```

Allowed values: `admin`, `viewer`. Cannot change the store owner.

**Response 200:**

```json
{
  "success": true,
  "data": {
    "userId": "usr_staff01",
    "role": "admin",
    "email": "staff@store.com",
    "name": "Alex Staff"
  }
}
```

---

### 4.3 DELETE `/api/v1/team/{userId}`

**Auth:** Bearer (`owner` only)

**Response:** `204`

---

## 5. Channel APIs

Base path: `/api/v1/channels`  
**Auth:** Bearer

### 5.1 GET `/api/v1/channels`

**Response 200:**

```json
{
  "success": true,
  "data": {
    "channels": [
      {
        "channel": "whatsapp",
        "status": "connected",
        "displayPhone": "+15551234567",
        "connectedAt": "2026-06-07T14:00:00Z"
      },
      {
        "channel": "messenger",
        "status": "disconnected"
      },
      {
        "channel": "instagram",
        "status": "disconnected"
      },
      {
        "channel": "web",
        "status": "connected",
        "widgetEnabled": true
      }
    ]
  }
}
```

---

### 5.2 POST `/api/v1/channels/meta/connect`

Exchange Meta OAuth code for long-lived token; subscribe webhooks.

**Request:**

```json
{
  "code": "meta_oauth_code",
  "redirectUri": "https://app.commercechat.com/channels/callback"
}
```

**Response 200:**

```json
{
  "success": true,
  "data": {
    "connected": ["whatsapp", "messenger"],
    "whatsapp": {
      "phoneNumberId": "444555666",
      "displayPhone": "+15551234567"
    },
    "messenger": {
      "pageId": "123456789",
      "pageName": "Acme Shoes"
    },
    "instagram": {
      "status": "not_linked"
    }
  }
}
```

---

### 5.3 DELETE `/api/v1/channels/meta/{channel}`

`channel`: `whatsapp` | `messenger` | `instagram`

**Response:** `204`

---

### 5.4 GET `/api/v1/channels/meta/health`

**Response 200:**

```json
{
  "success": true,
  "data": {
    "whatsapp": { "status": "healthy", "lastCheck": "2026-06-10T08:00:00Z" },
    "messenger": { "status": "disconnected" }
  }
}
```

---

## 6. Knowledge / Ingest APIs

Base path: `/api/v1/knowledge`  
**Auth:** Bearer

### 6.1 GET `/api/v1/knowledge/sources`

**Response 200:**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "sourceId": "src_vwx234",
        "type": "website",
        "name": "Main website",
        "status": "active",
        "chunkCount": 142,
        "vectorCount": 387,
        "lastSyncAt": "2026-06-08T02:00:00Z"
      }
    ]
  }
}
```

---

### 6.2 POST `/api/v1/knowledge/sources`

**Request — website:**

```json
{
  "type": "website",
  "name": "Main website",
  "config": {
    "url": "https://acme-shoes.com",
    "maxDepth": 3,
    "maxPages": 500
  }
}
```

**Request — catalog (multipart):**

```
POST multipart/form-data
  type=catalog
  name=Product catalog
  file=<csv|json>
```

**Response 201:**

```json
{
  "success": true,
  "data": {
    "sourceId": "src_vwx234",
    "type": "website",
    "status": "active",
    "createdAt": "2026-06-07T15:00:00Z"
  }
}
```

---

### 6.3 POST `/api/v1/knowledge/sources/{sourceId}/sync`

Trigger ingest job.

**Response 202:**

```json
{
  "success": true,
  "data": {
    "jobId": "job_yza567",
    "sourceId": "src_vwx234",
    "status": "queued"
  }
}
```

---

### 6.4 GET `/api/v1/knowledge/jobs`

**Query:** `?limit=20&cursor=...&status=completed`

**Response 200:**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "jobId": "job_yza567",
        "sourceId": "src_vwx234",
        "type": "website_sync",
        "status": "completed",
        "stats": {
          "pagesProcessed": 142,
          "chunksCreated": 387,
          "durationSec": 89
        },
        "completedAt": "2026-06-08T02:01:30Z"
      }
    ],
    "nextCursor": null,
    "hasMore": false
  }
}
```

---

### 6.5 GET `/api/v1/knowledge/jobs/{jobId}`

**Response 200:** Full job object including `error` if failed.

---

### 6.6 DELETE `/api/v1/knowledge/sources/{sourceId}`

Deletes source metadata + vectors (async cleanup).

**Response 202:**

```json
{
  "success": true,
  "message": "Source deletion queued."
}
```

---

### 6.7 POST `/api/v1/knowledge/faq` (MVP inline FAQ)

**Request:**

```json
{
  "items": [
    { "question": "What is your return policy?", "answer": "30-day returns..." },
    { "question": "Do you ship internationally?", "answer": "Yes, to 50 countries." }
  ]
}
```

**Response 200:**

```json
{
  "success": true,
  "data": {
    "sourceId": "src_faq001",
    "itemCount": 2,
    "status": "active"
  }
}
```

---

## 7. Conversation APIs (Admin)

Base path: `/api/v1/conversations`  
**Auth:** Bearer

### 7.1 GET `/api/v1/conversations`

**Query:** `?channel=whatsapp&status=active&limit=20&cursor=...`

**Response 200:**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "conversationId": "conv_jkl012",
        "channel": "whatsapp",
        "externalUserId": "919876543210",
        "customerName": "Priya",
        "status": "active",
        "messageCount": 8,
        "lastInboundAt": "2026-06-10T09:15:00Z",
        "updatedAt": "2026-06-10T09:15:08Z"
      }
    ],
    "nextCursor": "eyJ...",
    "hasMore": true
  }
}
```

---

### 7.2 GET `/api/v1/conversations/{conversationId}`

**Response 200:** Full conversation + cart summary if exists.

---

### 7.3 GET `/api/v1/conversations/{conversationId}/messages`

**Query:** `?limit=50&cursor=...&order=asc`

**Response 200:**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "messageId": "msg_pqr678",
        "direction": "inbound",
        "role": "user",
        "type": "text",
        "content": "Do you have blue sneakers size 9?",
        "createdAt": "2026-06-10T09:15:00.123Z"
      },
      {
        "messageId": "msg_pqr679",
        "direction": "outbound",
        "role": "assistant",
        "type": "text",
        "content": "Yes! I found 3 blue sneakers in size 9...",
        "metadata": {
          "llmModel": "gpt-4o-mini",
          "toolCalls": ["search_products"]
        },
        "createdAt": "2026-06-10T09:15:08.456Z"
      }
    ],
    "nextCursor": null,
    "hasMore": false
  }
}
```

---

## 8. Web Chat Widget APIs

Base path: `/api/v1/widget`  
**Auth:** `X-API-Key`

### 8.1 GET `/api/v1/widget/config`

**Response 200:**

```json
{
  "success": true,
  "data": {
    "storeName": "Acme Shoes",
    "greeting": "Hi! How can I help you shop today?",
    "primaryColor": "#4F46E5",
    "position": "bottom-right",
    "suggestedQuestions": ["Shipping info", "Best sellers"],
    "enabled": true
  }
}
```

---

### 8.2 POST `/api/v1/widget/chat`

Synchronous chat for MVP (streaming in Phase 2).

**Request:**

```json
{
  "sessionId": "web_sess_abc",
  "message": "Do you have blue sneakers?",
  "metadata": {
    "pageUrl": "https://acme-shoes.com/products",
    "userAgent": "Mozilla/5.0..."
  }
}
```

**Response 200:**

```json
{
  "success": true,
  "data": {
    "sessionId": "web_sess_abc",
    "conversationId": "conv_web_xyz",
    "intent": "product",
    "funnelStage": "discover",
    "subIntent": "product_browse",
    "reply": {
      "type": "text",
      "content": "Yes! Here are our blue sneakers..."
    },
    "suggestedActions": [
      {
        "type": "product",
        "sku": "SHOE-BLU-9",
        "label": "Blue Runner — $89.99",
        "action": "add_to_cart"
      },
      {
        "type": "checkout",
        "label": "View cart",
        "action": "checkout",
        "message": "Show my cart"
      }
    ]
  }
}
```

`funnelStage`: `discover` | `compare` | `objection` | `cart` | `checkout`  
`subIntent`: e.g. `product_browse`, `product_compare`, `objection_shipping` (see [07-chat-quality-roadmap.md](07-chat-quality-roadmap.md))  
`suggestedActions[].action`: `view` | `add_to_cart` | `checkout` — widget uses `add_to_cart` for direct cart API (§8.4).

---

### 8.3 POST `/api/v1/widget/cart`

Direct add-to-cart without LLM (widget product cards / CTA chips).

**Auth:** `X-API-Key` (widget public key)

**Request:**

```json
{
  "sessionId": "web_sess_abc",
  "sku": "SHOE-BLU-9",
  "quantity": 1,
  "variant": "Size 9"
}
```

**Response 200:**

```json
{
  "success": true,
  "data": {
    "sessionId": "web_sess_abc",
    "conversationId": "conv_web_xyz",
    "sku": "SHOE-BLU-9",
    "message": "Added Blue Runner to your cart (1 × $89.99).",
    "cart": {
      "items": [{ "sku": "SHOE-BLU-9", "name": "Blue Runner", "quantity": 1, "unitPrice": 89.99 }],
      "subtotal": 89.99,
      "currency": "USD"
    }
  }
}
```

**Errors:** `400` — unknown SKU, out of stock, validation error.

---

### 8.4 POST `/api/v1/widget/chat/stream` (Phase 2)

**Response:** `text/event-stream` (SSE)

```
event: token
data: {"delta": "Yes"}

event: done
data: {"conversationId": "conv_web_xyz", "messageId": "msg_..."}
```

---

## 9. Public Chat API (internal / testing)

### POST `/api/v1/chat`

Used by orchestrator internally or admin test console.

**Auth:** Bearer or internal service token

**Request:**

```json
{
  "tenantId": "ten_abc123",
  "channel": "whatsapp",
  "externalUserId": "919876543210",
  "message": {
    "type": "text",
    "content": "Add blue sneakers to cart"
  }
}
```

**Response 200:**

```json
{
  "success": true,
  "data": {
    "conversationId": "conv_jkl012",
    "reply": {
      "type": "text",
      "content": "Added Blue Runner Sneaker to your cart!"
    },
    "toolResults": [
      { "tool": "add_to_cart", "success": true, "sku": "SHOE-BLU-9" }
    ]
  }
}
```

---

## 10. Commerce APIs (Admin)

Base path: `/api/v1/commerce`  
**Auth:** Bearer

### 10.1 GET `/api/v1/commerce/products`

**Query:** `?q=blue+sneakers&limit=10`

**Response 200:**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "sku": "SHOE-BLU-9",
        "name": "Blue Runner Sneaker",
        "price": 89.99,
        "currency": "USD",
        "inStock": true,
        "imageUrl": "https://..."
      }
    ]
  }
}
```

---

### 10.2 POST `/api/v1/commerce/products/import`

Multipart CSV/JSON upload → triggers catalog ingest.

**Response 202:** Same as knowledge source sync.

---

### 10.3 GET `/api/v1/commerce/orders`

**Query:** `?status=pending&limit=20`

**Response 200:**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "orderId": "ord_stu901",
        "conversationId": "conv_jkl012",
        "status": "pending",
        "total": 89.99,
        "currency": "USD",
        "createdAt": "2026-06-10T09:20:00Z"
      }
    ]
  }
}
```

---

### 10.4 PATCH `/api/v1/commerce/connector`

**Request:**

```json
{
  "type": "manual",
  "checkoutBaseUrl": "https://acme-shoes.com/checkout",
  "webhookUrl": null
}
```

**Response 200:** Updated `commerceConnector` object.

---

## 11. Billing APIs (Phase 2)

Base path: `/api/v1/billing`  
**Auth:** Bearer (`owner`)

### 11.1 GET `/api/v1/billing/subscription`

**Response 200:**

```json
{
  "success": true,
  "data": {
    "plan": "starter",
    "status": "active",
    "currentPeriodEnd": "2026-07-06T00:00:00Z",
    "cancelAtPeriodEnd": false
  }
}
```

---

### 11.2 POST `/api/v1/billing/checkout`

**Request:**

```json
{
  "plan": "starter",
  "successUrl": "https://app.commercechat.com/billing/success",
  "cancelUrl": "https://app.commercechat.com/billing"
}
```

**Response 200:**

```json
{
  "success": true,
  "data": {
    "checkoutUrl": "https://checkout.stripe.com/c/pay/..."
  }
}
```

---

### 11.3 POST `/api/v1/billing/portal`

**Response 200:**

```json
{
  "success": true,
  "data": {
    "portalUrl": "https://billing.stripe.com/p/session/..."
  }
}
```

---

## 12. Webhook APIs (no JWT)

### 12.1 GET `/webhooks/meta`

Meta verification challenge.

**Query:** `hub.mode`, `hub.verify_token`, `hub.challenge`

**Response 200:** Plain text challenge string

---

### 12.2 POST `/webhooks/meta`

**Headers:** `X-Hub-Signature-256`

**Body:** Meta webhook payload (passthrough)

**Response 200:**

```json
{
  "success": true
}
```

*Returns immediately; processing is async via SQS.*

---

### 12.3 POST `/webhooks/stripe` (Phase 2)

**Headers:** `Stripe-Signature`

**Body:** Stripe event JSON

**Response 200:** `{ "received": true }`

---

## 13. Onboarding APIs

Base path: `/api/v1/onboarding`  
**Auth:** Bearer (`owner` only for wizard progression)

### 13.1 GET `/api/v1/onboarding`

Returns wizard state, completed steps, and per-step validation status.

**Response 200:**

```json
{
  "success": true,
  "data": {
    "currentStep": "knowledge",
    "steps": [
      {
        "step": "profile",
        "status": "completed",
        "completedAt": "2026-06-06T10:30:00Z"
      },
      {
        "step": "channels",
        "status": "completed",
        "completedAt": "2026-06-06T10:45:00Z",
        "metadata": { "whatsappConnected": true }
      },
      {
        "step": "knowledge",
        "status": "in_progress",
        "metadata": { "sourceId": "src_vwx234", "jobStatus": "running" }
      },
      { "step": "catalog", "status": "pending" },
      { "step": "test", "status": "pending" },
      { "step": "widget", "status": "pending" }
    ],
    "canSkip": ["channels", "catalog"],
    "estimatedMinutesRemaining": 8
  }
}
```

---

### 13.2 PATCH `/api/v1/onboarding/step`

Advance or skip onboarding step.

**Request:**

```json
{
  "step": "catalog",
  "skipped": false
}
```

**Skip example:**

```json
{
  "step": "test",
  "skipped": true,
  "skippedSteps": ["catalog"]
}
```

**Response 200:**

```json
{
  "success": true,
  "data": {
    "previousStep": "knowledge",
    "currentStep": "catalog",
    "onboardingStep": "catalog"
  }
}
```

**Errors:** `ONBOARDING_INCOMPLETE` (validation failed), `FORBIDDEN` (non-owner)

**Validation rules:**


| Advancing to | Requires                                               |
| ------------ | ------------------------------------------------------ |
| `channels`   | `storeName`, `timezone` on tenant                      |
| `knowledge`  | None                                                   |
| `catalog`    | Website source created OR `skipped: true` on knowledge |
| `test`       | None                                                   |
| `widget`     | ≥1 test chat message                                   |
| `complete`   | None                                                   |


---

### 13.3 POST `/api/v1/onboarding/test-chat`

Send a message in the onboarding simulator (wraps internal chat).

**Request:**

```json
{
  "message": "What are your shipping options?"
}
```

**Response 200:**

```json
{
  "success": true,
  "data": {
    "reply": {
      "type": "text",
      "content": "We offer free shipping on orders over $50..."
    },
    "testMessageCount": 1,
    "canAdvanceToWidget": false
  }
}
```

---

## 14. Health & system

### GET `/health`

**Auth:** None

**Response 200:**

```json
{
  "status": "ok",
  "version": "1.0.0",
  "timestamp": "2026-06-10T09:15:00Z"
}
```

---

## 15. JWT claims

```json
{
  "sub": "usr_def456",
  "tid": "ten_abc123",
  "role": "owner",
  "email": "owner@store.com",
  "mfa": true,
  "iat": 1718010000,
  "exp": 1718013600
}
```


| Claim  | Description                  |
| ------ | ---------------------------- |
| `sub`  | User ID                      |
| `tid`  | Tenant ID                    |
| `role` | `owner` | `admin` | `viewer` |
| `mfa`  | MFA verified this session    |


---

## 16. Rate limits


| Endpoint group        | Limit                         |
| --------------------- | ----------------------------- |
| `/auth/login`         | 10/min per IP                 |
| `/auth/signup`        | 5/min per IP                  |
| `/api/v1/widget/chat` | 30/min per API key            |
| `/api/v1/widget/cart` | 30/min per API key            |
| Admin APIs            | 100/min per tenant            |
| Webhooks              | No limit (signature verified) |


**429 response:**

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests",
    "retryAfter": 45
  }
}
```

---

## 17. API route summary


| Method    | Path                                       | Auth       | Phase |
| --------- | ------------------------------------------ | ---------- | ----- |
| POST      | `/auth/signup`                             | —          | MVP   |
| POST      | `/auth/login`                              | —          | MVP   |
| GET       | `/auth/me`                                 | Bearer     | MVP   |
| POST      | `/auth/refresh`                            | —          | MVP   |
| POST      | `/auth/logout`                             | Bearer     | MVP   |
| POST      | `/auth/forgot-password`                    | —          | MVP   |
| POST      | `/auth/reset-password`                     | —          | MVP   |
| POST      | `/auth/verify-email`                       | —          | MVP   |
| POST      | `/auth/resend-verification`                | —          | MVP   |
| POST      | `/auth/mfa/verify`                         | —          | P2    |
| POST      | `/auth/invite`                             | Bearer     | MVP   |
| POST      | `/auth/accept-invite`                      | —          | MVP   |
| GET       | `/api/v1/onboarding`                       | Bearer     | MVP   |
| PATCH     | `/api/v1/onboarding/step`                  | Bearer     | MVP   |
| POST      | `/api/v1/onboarding/test-chat`             | Bearer     | MVP   |
| POST      | `/api/v1/tenants/me/logo`                  | Bearer     | MVP   |
| POST      | `/api/v1/tenants/me/logo/presign`          | Bearer     | MVP   |
| POST      | `/api/v1/tenants/me/logo/complete`         | Bearer     | MVP   |
| GET       | `/api/v1/tenants/me`                       | Bearer     | MVP   |
| PATCH     | `/api/v1/tenants/me`                       | Bearer     | MVP   |
| GET/PATCH | `/api/v1/tenants/me/config`                | Bearer     | MVP   |
| GET       | `/api/v1/tenants/me/limits`                | Bearer     | MVP   |
| GET       | `/api/v1/tenants/me/usage`                 | Bearer     | MVP   |
| POST      | `/api/v1/tenants/me/widget/regenerate-key` | Bearer     | MVP   |
| GET       | `/api/v1/channels`                         | Bearer     | MVP   |
| POST      | `/api/v1/channels/meta/connect`            | Bearer     | MVP   |
| DELETE    | `/api/v1/channels/meta/{channel}`          | Bearer     | MVP   |
| GET       | `/api/v1/knowledge/sources`                | Bearer     | MVP   |
| POST      | `/api/v1/knowledge/sources`                | Bearer     | MVP   |
| POST      | `/api/v1/knowledge/sources/{id}/sync`      | Bearer     | MVP   |
| GET       | `/api/v1/knowledge/jobs`                   | Bearer     | MVP   |
| POST      | `/api/v1/knowledge/faq`                    | Bearer     | MVP   |
| GET       | `/api/v1/conversations`                    | Bearer     | MVP   |
| GET       | `/api/v1/conversations/{id}/messages`      | Bearer     | MVP   |
| GET       | `/api/v1/widget/config`                    | API Key    | MVP   |
| POST      | `/api/v1/widget/chat`                      | API Key    | MVP   |
| POST      | `/api/v1/widget/cart`                      | API Key    | MVP   |
| GET/POST  | `/webhooks/meta`                           | Signature  | MVP   |
| GET       | `/health`                                  | —          | MVP   |
| GET/POST  | `/api/v1/billing/*`                        | Bearer     | P2    |
| POST      | `/webhooks/stripe`                         | Stripe sig | P2    |
| GET       | `/api/v1/team`                             | Bearer     | MVP   |
| PATCH     | `/api/v1/team/{userId}`                    | Bearer     | MVP   |
| DELETE    | `/api/v1/team/{userId}`                    | Bearer     | MVP   |
| POST      | `/api/v1/widget/chat/stream`               | API Key    | P2    |


