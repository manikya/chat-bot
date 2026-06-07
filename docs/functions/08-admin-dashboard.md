# Function Spec: Admin Dashboard

**Parent:** [00-MASTER-ARCHITECTURE.md](../00-MASTER-ARCHITECTURE.md)  
**Version:** 1.0

---

## 1. Purpose

Web application for merchants to onboard, connect channels, manage knowledge sources, configure the bot, view conversations, and monitor usage.

---

## 2. Tech stack

| Layer | Choice |
|-------|--------|
| Frontend | Next.js 14 (App Router) |
| Hosting | AWS Amplify Hosting or S3 + CloudFront |
| Auth | Custom JWT login (Jetwing `app/login` pattern) — [13-custom-auth.md](13-custom-auth.md) |
| API | API Gateway `/api/v1/admin/*` |
| Styling | Tailwind CSS |

---

## 3. User roles and permissions

| Feature | Owner | Admin | Viewer |
|---------|-------|-------|--------|
| Billing / plan | ✅ | ❌ | ❌ |
| Connect Meta channels | ✅ | ✅ | ❌ |
| Manage knowledge sources | ✅ | ✅ | ❌ |
| Edit bot prompts | ✅ | ✅ | ❌ |
| View conversations | ✅ | ✅ | ✅ |
| View analytics | ✅ | ✅ | ✅ |
| Invite team members | ✅ | ✅ | ❌ |
| Delete tenant | ✅ | ❌ | ❌ |

---

## 4. Pages and features

### 4.1 Onboarding wizard (first login)

```
Step 1: Store profile (name, timezone, logo)
Step 2: Connect channels (Meta OAuth / WhatsApp setup)
Step 3: Add website URL → trigger ingest
Step 4: Upload product CSV (or skip)
Step 5: Test chat (built-in simulator)
Step 6: Copy widget embed code
```

### 4.2 Dashboard home

| Widget | Data |
|--------|------|
| Messages today / this month | Usage API |
| Conversations active | DynamoDB count |
| Orders influenced | Analytics |
| Channel status | Meta health API |
| Knowledge sync status | Ingest jobs |
| Quota usage bar | Plan limits |

### 4.3 Conversations

| Feature | Spec |
|---------|------|
| List | Filter by channel, date, status; paginated |
| Thread view | Full message history; customer ID masked |
| Search | Full-text on conversation content (OpenSearch — Phase 3; DynamoDB scan MVP) |
| Export | CSV download (Pro plan) |
| Manual reply (Phase 3) | Human takeover |

### 4.4 Knowledge base

| Feature | Spec |
|---------|------|
| Sources list | Website, catalog, conversations, FAQ |
| Add source | Forms per source type |
| Sync status | Job progress bar + errors |
| Re-sync button | Triggers ingest job |
| Delete source | Confirmation modal |
| FAQ editor | Inline add/edit/delete |
| Eval results | Recall@5 score post-ingest |

### 4.5 Bot configuration

| Setting | UI control |
|---------|------------|
| System prompt | Textarea with variables helper |
| Greeting message | Text input |
| Suggested questions (widget) | Tag input |
| LLM model per intent | Dropdown (plan-gated) |
| Enabled channels | Toggle per channel |
| Widget appearance | Color picker, position, avatar upload |

### 4.6 Channels

| Feature | Spec |
|---------|------|
| Connection status | Green/red per channel |
| Connect / reconnect | Meta OAuth button |
| WhatsApp templates | List approved templates |
| Test message | Send test to merchant's own number |

### 4.7 Analytics (Phase 2)

| Chart | Metric |
|-------|--------|
| Messages over time | Line chart by channel |
| Intent breakdown | Pie: faq, product, checkout |
| Top products searched | Bar chart |
| Conversion funnel | Conversations → cart → checkout |
| Response latency | p50/p95 |

### 4.8 Billing (see 09)

| Page | Content |
|------|---------|
| Plan | Current plan, upgrade CTA |
| Usage | Messages, tokens, storage |
| Invoices | Stripe portal link |

### 4.9 Settings

- Team members (invite, roles)
- API keys (widget key rotation)
- Domain allowlist (Pro)
- Data export / delete account
- Notification preferences

---

## 5. API endpoints (admin)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/admin/dashboard` | Summary stats |
| GET | `/api/v1/admin/conversations` | List conversations |
| GET | `/api/v1/admin/conversations/:id` | Thread detail |
| GET | `/api/v1/admin/analytics` | Analytics data |
| PATCH | `/api/v1/admin/config` | Update bot config |
| POST | `/api/v1/admin/team/invite` | Invite user |
| POST | `/api/v1/admin/widget/rotate-key` | Rotate widget API key |

All endpoints: Lambda JWT authorizer + tenant scope from `tid` claim — [13-custom-auth.md](13-custom-auth.md).

---

## 6. Chat simulator (onboarding + testing)

Built into admin — uses same orchestrator as production:

```
┌─────────────────────────────────┐
│  Test your bot                   │
│  ┌───────────────────────────┐  │
│  │ Bot: Hi! How can I help?  │  │
│  │ You: Do you ship to UK?   │  │
│  │ Bot: Yes! We ship to...   │  │
│  └───────────────────────────┘  │
│  [Type a message...]      [Send] │
└─────────────────────────────────┘
```

- Channel simulation mode: `web` (default)
- Shows retrieved RAG chunks in debug panel (admin only)
- Shows tool calls and latency in debug panel

---

## 7. Notifications

See [12-notifications-email-sms.md](12-notifications-email-sms.md) for full spec.

| Event | Channel | Email sender |
|-------|---------|--------------|
| Ingest job failed | Email + in-app banner | Resend (MVP) |
| Meta token expired | Email + dashboard alert | Resend (MVP) |
| Quota 80% reached | Email | Resend (Phase 2) |
| Quota 100% reached | Email + in-app | Resend (Phase 2) |
| Payment failed | Email | Resend (Phase 2) |
| New conversation (optional) | Email digest (Pro) | Resend (Phase 2) |

**Auth emails (signup, password reset):** Resend via auth Lambdas — [12-notifications-email-sms.md](12-notifications-email-sms.md).

**MFA (Phase 2):** Settings → Security — TOTP QR enroll + email OTP; second login step when enabled.

---

## 8. Lambda functions

| Function | Responsibility |
|----------|----------------|
| `admin-dashboard-api` | Aggregate stats |
| `admin-conversations` | List/get conversations |
| `admin-config` | CRUD bot config |
| `admin-team` | Invite/manage users |

---

## 9. Testing checklist

- [ ] Onboarding wizard completes end-to-end
- [ ] Role permissions enforced (viewer cannot edit)
- [ ] Conversation list loads with pagination
- [ ] Config changes reflect in test simulator
- [ ] Meta connect flow stores credentials
- [ ] Ingest job status updates in real-time (poll 5s)
- [ ] Widget embed code copy works
- [ ] Tenant A cannot see Tenant B conversations
