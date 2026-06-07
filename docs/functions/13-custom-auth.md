# Function Spec: Custom Authentication (DynamoDB + JWT)

**Parent:** [00-MASTER-ARCHITECTURE.md](../00-MASTER-ARCHITECTURE.md)  
**Version:** 1.0  
**Replaces:** Amazon Cognito (not used)

---

## 1. Purpose

Authenticate **merchants and team members** using users and sessions stored in **DynamoDB**, with JWT access tokens and refresh tokens. The design is **MFA-ready** from day one but MFA is **disabled in MVP** and enabled per user/plan in later phases.

**Not in scope:** Customer (shopper) auth on WhatsApp/Messenger/Instagram — those use channel IDs.

---

## 2. Design principles

1. **No Cognito** — full control; works cleanly with LocalStack
2. **MFA-ready schema** — add MFA without migration or auth rewrite
3. **JWT only after full auth** — password alone is insufficient when MFA is enabled
4. **Tenant-scoped users** — every user belongs to exactly one tenant
5. **Align with Jetwing reference** — custom login page + Bearer token pattern

---

## 3. MFA roadmap

| Phase | MFA support | Method |
|-------|-------------|--------|
| **MVP** | Off for all users | Schema + two-step login flow stubbed |
| **Phase 2** | Optional per user | **TOTP** (Google Authenticator, Authy) |
| **Phase 2** | Optional per user | **Email OTP** via Resend |
| **Phase 3** | Enterprise option | **SMS OTP** via Twilio `SmsProvider` |
| **Phase 3** | Enterprise | Backup codes (one-time use) |

### Recommended default order

1. **TOTP** — best security/cost ratio; no per-message fee
2. **Email OTP** — easier for non-technical merchants
3. **SMS OTP** — enterprise only; Twilio costs + deliverability

---

## 4. DynamoDB schema

### User record

| PK | SK | GSI1-PK |
|----|-----|---------|
| `TENANT#<tenantId>` | `USER#<userId>` | `EMAIL#<normalizedEmail>` |

```json
{
  "userId": "usr_abc123",
  "tenantId": "ten_xyz",
  "email": "owner@store.com",
  "emailNormalized": "owner@store.com",
  "passwordHash": "$argon2id$v=19$...",
  "role": "owner",
  "status": "active",
  "emailVerified": true,
  "mfa": {
    "enabled": false,
    "method": "none",
    "totpSecretEncrypted": null,
    "enrolledAt": null,
    "backupCodesHash": []
  },
  "failedLoginAttempts": 0,
  "lockedUntil": null,
  "createdAt": "2026-06-06T00:00:00Z",
  "lastLoginAt": null
}
```

**`mfa.method` values:** `none` | `totp` | `email` | `sms`

**TOTP secret:** encrypted with KMS before storage; never returned to client after enrollment.

### Session record

| PK | SK |
|----|-----|
| `TENANT#<tenantId>` | `SESSION#<sessionId>` |

```json
{
  "sessionId": "sess_abc",
  "userId": "usr_abc123",
  "refreshTokenHash": "$argon2id$...",
  "mfaVerified": true,
  "userAgent": "...",
  "ipHash": "...",
  "createdAt": "...",
  "expiresAt": "...",
  "revoked": false
}
```

When MFA is enabled, `mfaVerified` is `false` until step 2 completes. Refresh token is **not** issued until `mfaVerified: true`.

### MFA challenge (temporary, step 2)

| PK | SK | TTL |
|----|-----|-----|
| `MFA_CHALLENGE#<challengeId>` | `META` | 5 minutes |

```json
{
  "challengeId": "mfa_ch_abc",
  "tenantId": "ten_xyz",
  "userId": "usr_abc123",
  "method": "totp",
  "attempts": 0,
  "expiresAt": 1717670400
}
```

### Email / reset tokens

| PK | SK | TTL |
|----|-----|-----|
| `TOKEN#<tokenHash>` | `META` | per purpose |

Purposes: `email_verify`, `password_reset`, `invite`, `email_otp` (MFA)

---

## 5. Auth flows

### 5.1 Signup (MVP)

```
POST /auth/signup { email, password, storeName }
  → validate email + password policy
  → hash password (Argon2id)
  → TransactWrite: TENANT#PROFILE + TENANT#CONFIG + TENANT#USER + GSI email
  → create TOKEN#email_verify
  → Resend: verify-email template
  → 201 { message: "Check your email" }
```

### 5.2 Login without MFA (MVP)

```
POST /auth/login { email, password }
  → GSI EMAIL# lookup
  → verify password; check lockout
  → if !emailVerified → 403 EMAIL_NOT_VERIFIED
  → if user.mfa.enabled → go to 5.3
  → create SESSION; issue access JWT + refresh token
  → 200 { accessToken, refreshToken, expiresIn, user }
```

### 5.3 Login with MFA (Phase 2+)

```
POST /auth/login { email, password }
  → password valid + mfa.enabled
  → 200 { mfaRequired: true, challengeId, method: "totp" | "email" | "sms" }
     (no access/refresh tokens yet)

POST /auth/mfa/verify { challengeId, code }
  → validate challenge TTL + attempts (max 5)
  → verify TOTP / email OTP / SMS OTP
  → create SESSION (mfaVerified: true)
  → issue access JWT + refresh token
  → 200 { accessToken, refreshToken, expiresIn, user }
```

### 5.4 TOTP enrollment (Phase 2)

```
POST /auth/mfa/totp/enroll   [requires JWT]
  → generate TOTP secret
  → return { qrCodeUrl, secret } (secret shown once)
  → store encrypted secret; mfa.enabled = false until confirmed

POST /auth/mfa/totp/confirm  [requires JWT] { code }
  → verify code against pending secret
  → mfa.enabled = true; mfa.method = "totp"
  → generate 10 backup codes; return once
```

### 5.5 Refresh

```
POST /auth/refresh { refreshToken }
  → hash refresh token; lookup SESSION
  → verify not revoked/expired; session.mfaVerified must be true
  → rotate refresh token; issue new access JWT
```

---

## 6. JWT specification

| Claim | Value |
|-------|-------|
| `sub` | `userId` |
| `tid` | `tenantId` |
| `role` | `owner` \| `admin` \| `viewer` |
| `mfa` | `true` (always true in issued tokens — MFA step completed) |
| `exp` | 15–60 min (configurable) |
| `iat` | issued at |
| `iss` | `commercechat.com` |

**Signing:** RS256 (recommended, public key in authorizer) or HS256 (secret in Secrets Manager).

**Authorizer context passed to Lambdas:**
```json
{ "tenantId": "ten_xyz", "userId": "usr_abc", "role": "admin" }
```

---

## 7. API endpoints

| Method | Path | Auth | Phase |
|--------|------|------|-------|
| POST | `/auth/signup` | Public | MVP |
| POST | `/auth/login` | Public | MVP |
| POST | `/auth/mfa/verify` | Public + challengeId | Phase 2 |
| POST | `/auth/mfa/totp/enroll` | JWT | Phase 2 |
| POST | `/auth/mfa/totp/confirm` | JWT | Phase 2 |
| POST | `/auth/mfa/disable` | JWT (owner/admin self) | Phase 2 |
| POST | `/auth/refresh` | Refresh token | MVP |
| POST | `/auth/logout` | JWT or refresh | MVP |
| POST | `/auth/forgot-password` | Public | MVP |
| POST | `/auth/reset-password` | Public + token | MVP |
| POST | `/auth/verify-email` | Public + token | MVP |
| POST | `/auth/invite` | JWT (owner/admin) | MVP |
| POST | `/auth/accept-invite` | Public + token | MVP |
| GET | `/auth/me` | JWT | MVP |

---

## 8. Password policy

| Rule | Value |
|------|-------|
| Min length | 10 |
| Complexity | 1 upper, 1 lower, 1 digit (zxcvbn score ≥ 3 optional) |
| Hashing | **Argon2id** (memory 64MB, iterations 3) |
| Breach check | Have I Been Pwned API (Phase 2, k-anonymity) |

---

## 9. Security controls

| Control | Implementation |
|---------|----------------|
| Brute force | Lock account 15 min after 5 failed logins |
| Rate limit | API Gateway / WAF: 10 login attempts/min per IP |
| Refresh rotation | New refresh token on each use; detect reuse → revoke all sessions |
| Session revoke | Logout sets `revoked: true`; password change revokes all sessions |
| MFA attempts | Max 5 per challenge; then invalidate challenge |
| Secrets | JWT signing key + TOTP encryption key in Secrets Manager / KMS |
| Logs | Never log passwords, OTP codes, TOTP secrets, or refresh tokens |

---

## 10. Lambda functions

| Function | Responsibility |
|----------|----------------|
| `auth-signup` | Tenant + user creation |
| `auth-login` | Password verify; MFA branch |
| `auth-mfa-verify` | Step 2 MFA validation |
| `auth-mfa-enroll` | TOTP setup |
| `auth-refresh` | Token rotation |
| `auth-password` | Forgot/reset |
| `auth-invite` | Team invites |
| `jwt-authorizer` | API Gateway authorizer |

---

## 11. Admin UI (Jetwing-aligned)

| Page | Reference |
|------|-----------|
| `app/login/page.tsx` | Jetwing login layout |
| Settings → Security | MFA enroll/disable (Phase 2) |
| Team invite | Existing admin team flow |

MVP login form: email + password only.  
Phase 2: second screen for 6-digit OTP when `mfaRequired`.

---

## 12. Email integration

All auth emails via **Resend** — see [12-notifications-email-sms.md](12-notifications-email-sms.md).

| Template | When |
|----------|------|
| `verify-email` | Signup |
| `password-reset` | Forgot password |
| `team-invite` | Invite accepted flow |
| `mfa-email-otp` | MFA step (Phase 2) |

**No Cognito, no SES required for auth** (SES remains optional fallback on EmailProvider).

---

## 13. LocalStack / local dev

| Item | Approach |
|------|----------|
| Users/sessions | DynamoDB in LocalStack |
| JWT | Same authorizer; dev signing key in `.env.local` |
| Resend | Log emails to console or LocalStack S3 |
| MFA TOTP | Works identically locally (time-based) |

---

## 14. Testing checklist

### MVP

- [ ] Signup creates tenant + user atomically
- [ ] Email verification required before login
- [ ] Login returns JWT with correct `tid`, `role`
- [ ] Authorizer rejects expired/tampered JWT
- [ ] Refresh token rotation works
- [ ] Password reset flow end-to-end
- [ ] Account lockout after 5 failures
- [ ] Cross-tenant: user A cannot access tenant B
- [ ] `mfa.enabled: false` — login returns tokens immediately

### Phase 2 (MFA)

- [ ] TOTP enroll + confirm enables MFA
- [ ] Login returns `mfaRequired` when MFA on
- [ ] Wrong OTP rejected; challenge expires after 5 min
- [ ] Backup code works once
- [ ] Email OTP MFA via Resend
- [ ] JWT not issued before MFA verify

---

## 15. Dependencies

| Provides to | Depends on |
|-------------|------------|
| All admin APIs (JWT authorizer) | DynamoDB, Secrets Manager |
| [08 Admin Dashboard](08-admin-dashboard.md) | Login UI |
| [12 Notifications](12-notifications-email-sms.md) | Auth emails |
| [10 Security](10-security-compliance.md) | Password/session policy |
