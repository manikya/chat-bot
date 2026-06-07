# UI Inventory & Actions

**Parent:** [00-MASTER-ARCHITECTURE.md](../00-MASTER-ARCHITECTURE.md)  
**Related:** [08-admin-dashboard.md](../functions/08-admin-dashboard.md) · [04-onboarding-and-registration.md](04-onboarding-and-registration.md) · [07-web-chat-widget.md](../functions/07-web-chat-widget.md) · [06-api-implementation-status.md](06-api-implementation-status.md)  
**Reference UI:** [Jetwing component mapping](../../reference%20UI/README.md)  
**Implementation status (2026-06-07):** Auth, tenant, onboarding, knowledge ingest, chat orchestrator, usage, conversations, dashboard stats, and widget embed (`/widget/v1.js`) use **real Lambdas + DynamoDB**. **Mock fallback:** channels, team. Widget bot replies render `**bold**`, numbered list breaks, and `\n` line breaks; product `suggestedActions` show as tappable chips under replies. Timezone fields use a native `<select>` (`TimezoneSelect`, ~32 curated IANA zones).

---

## 1. Application surfaces

| Surface | URL / host | Users | Phase |
|---------|------------|-------|-------|
| **Marketing site** | `commercechat.com` | Prospects | P2 |
| **Admin app** | `app.commercechat.com` | Merchants (owner/admin/viewer) | MVP |
| **Web widget** | Embedded on merchant storefront | Shoppers | MVP |
| **Auth pages** | `app.commercechat.com/auth/*` | Merchants | MVP |

**Shoppers** never use the admin app. They interact via WhatsApp, Messenger, Instagram, or the web widget.

---

## 2. Global admin shell (authenticated)

Applies to all post-login admin pages except onboarding wizard (minimal chrome).

| UI element | Actions |
|------------|---------|
| **Sidebar nav** | Navigate to Dashboard, Conversations, Knowledge, Bot, Channels, Widget, Usage, Billing, Settings |
| **Top bar — store name** | Read-only display |
| **Top bar — user menu** | Open profile menu; log out |
| **Notification bell** | View alerts (ingest failed, token expired, quota); mark read (P2) |
| **Setup banner** | Shown when `onboardingStep !== complete` → click **Finish setup** → resume wizard |
| **Quota warning bar** | Shown at 80%+ usage (P2) → click **Upgrade** |

### Sidebar visibility by role

| Nav item | Owner | Admin | Viewer |
|----------|-------|-------|--------|
| Dashboard | ✅ | ✅ | ✅ |
| Conversations | ✅ | ✅ | ✅ |
| Knowledge | ✅ | ✅ | 👁 view only |
| Bot config | ✅ | ✅ | 👁 view only |
| Channels | ✅ | ✅ | 👁 view only |
| Widget | ✅ | ✅ | 👁 view only |
| Usage | ✅ | ✅ | ✅ |
| Billing | ✅ | ❌ | ❌ |
| Settings | ✅ | ✅ | 👁 partial |
| Analytics | ✅ | ✅ | ✅ (P2) |
| Agent inbox | ✅ | ✅ | ❌ (P3) |

---

## 3. Public & auth UIs (unauthenticated)

### 3.1 Marketing — Home (`/`)

**Phase:** P2 · **Auth:** None

| UI element | User actions |
|------------|--------------|
| Hero + value prop | Scroll; click **Start free trial** → Signup |
| Feature sections | Scroll; click channel/feature anchors |
| Pricing table | Compare plans; click **Get started** per plan → Signup |
| Footer | Open docs, privacy, terms; contact sales |

---

### 3.2 Marketing — Pricing (`/pricing`)

**Phase:** P2 · **Auth:** None

| UI element | User actions |
|------------|--------------|
| Plan cards (Trial, Starter, Pro, Business) | Click **Start trial** or **Subscribe** → Signup / Checkout (P2) |
| Feature comparison table | Scroll / expand rows |
| FAQ accordion | Expand/collapse questions |

---

### 3.3 Sign up (`/signup`)

**Phase:** MVP · **Auth:** None

| UI element | User actions |
|------------|--------------|
| Store name input | Enter store name |
| Full name input | Enter owner name |
| Email input | Enter email |
| Password input | Enter password; toggle show/hide |
| Timezone select (`TimezoneSelect`) | Pick from grouped native dropdown (~32 IANA zones); browser default pre-selected |
| Terms checkbox | Accept terms of service |
| **Create account** button | Submit → `POST /auth/signup` → redirect to Verify pending |
| **Log in** link | Navigate to Login |

**Validation errors:** inline field errors; `EMAIL_EXISTS` → suggest login.

---

### 3.4 Log in (`/login`)

**Phase:** MVP · **Auth:** None  
**Reference:** Jetwing `app/login/page.tsx`

| UI element | User actions |
|------------|--------------|
| Email input | Enter email |
| Password input | Enter password; toggle show/hide |
| **Log in** button | Submit → `POST /auth/login` |
| **Forgot password?** link | Navigate to Forgot password |
| **Sign up** link | Navigate to Signup |
| MFA code input (P2) | Enter 6-digit code when `mfaRequired` |
| **Verify** button (P2) | Submit → `POST /auth/mfa/verify` |

**Post-login routing:**
- Unverified email → Verify pending
- Owner + incomplete onboarding → Onboarding wizard
- Otherwise → Dashboard

---

### 3.5 Verify email — pending (`/verify-email-pending`)

**Phase:** MVP · **Auth:** None (or partial session)

| UI element | User actions |
|------------|--------------|
| Instruction text | Read "Check your inbox" message |
| Email display | View which email was sent to |
| **Resend verification** button | `POST /auth/resend-verification` |
| **Back to login** link | Navigate to Login |

---

### 3.6 Verify email — callback (`/verify-email`)

**Phase:** MVP · **Auth:** None

| UI element | User actions |
|------------|--------------|
| Loading state | Auto-submit token from URL query |
| Success message | Click **Continue to login** |
| Error message | Click **Resend** or **Contact support** |

**On load:** `POST /auth/verify-email` with `?token=` from email link.

---

### 3.7 Forgot password (`/forgot-password`)

**Phase:** MVP · **Auth:** None

| UI element | User actions |
|------------|--------------|
| Email input | Enter email |
| **Send reset link** button | `POST /auth/forgot-password` |
| **Back to login** link | Navigate to Login |

---

### 3.8 Reset password (`/reset-password`)

**Phase:** MVP · **Auth:** None

| UI element | User actions |
|------------|--------------|
| New password input | Enter new password |
| Confirm password input | Re-enter password |
| **Reset password** button | `POST /auth/reset-password` → redirect Login |
| Expired token message | Click **Request new link** → Forgot password |

---

### 3.9 Accept team invite (`/accept-invite`)

**Phase:** MVP · **Auth:** None

| UI element | User actions |
|------------|--------------|
| Invite summary | View store name, role, inviter |
| Name input | Enter display name |
| Password input | Set password |
| **Join team** button | `POST /auth/accept-invite` → Dashboard (skip onboarding) |

---

## 4. Onboarding wizard (`/onboarding/*`)

**Phase:** MVP · **Roles:** Owner only · **Layout:** Stepper + minimal header (no full sidebar)

Shared chrome across all steps:

| UI element | User actions |
|------------|--------------|
| Progress stepper (1–6) | View current step; click completed steps to go back |
| **Back** button | Return to previous step |
| **Skip** button | Skip optional steps (channels, catalog) |
| **Continue** button | Validate step → `PATCH /api/v1/onboarding/step` |

---

### 4.1 Step 1 — Store profile (`/onboarding/profile`)

| UI element | User actions |
|------------|--------------|
| Store name input | Edit store name |
| Timezone select (`TimezoneSelect`) | Change timezone (native grouped dropdown) |
| Logo upload dropzone | Upload PNG/JPG (max 2 MB); preview; remove → `POST /tenants/me/logo` *(mock)* |
| Default language select | Select language (optional) |
| **Continue** | `PATCH /tenants/me` + `PATCH /onboarding/step` → Channels |

---

### 4.2 Step 2 — Connect channels (`/onboarding/channels`)

| UI element | User actions |
|------------|--------------|
| WhatsApp card | Click **Connect WhatsApp** → Meta OAuth popup → `POST /channels/meta/connect` |
| WhatsApp status | View connected phone number or error |
| Messenger card (P2) | Connect Messenger (greyed in MVP) |
| Instagram card (P2) | Connect Instagram (greyed in MVP) |
| Web widget card | View "Auto-enabled" status |
| **Send test message** (optional) | Send test WA to own number |
| **Skip for now** | Advance without WhatsApp |
| **Continue** | Advance to Knowledge |

---

### 4.3 Step 3 — Website knowledge (`/onboarding/knowledge`)

| UI element | User actions |
|------------|--------------|
| Website URL input | Enter store URL |
| **Crawl my site** button | `POST /knowledge/sources` + `POST /sync` *(real crawl + embed locally)* |
| Progress bar | Poll `GET /knowledge/jobs/{jobId}` until complete |
| Error panel | View crawl errors; **Retry** |
| FAQ quick-add (optional) | Add Q&A pairs inline → `POST /knowledge/faq` |
| **Skip for now** | Advance without source |
| **Continue** | Advance when job complete or skipped |

---

### 4.4 Step 4 — Product catalog (`/onboarding/catalog`)

| UI element | User actions |
|------------|--------------|
| CSV/JSON dropzone | Upload file → catalog source + sync |
| Template download link | Download sample CSV |
| Upload progress | View ingest job status |
| **Skip** | Advance without catalog |
| **Continue** | Advance to Test |

---

### 4.5 Step 5 — Test chat (`/onboarding/test`)

| UI element | User actions |
|------------|--------------|
| Chat window | View bot greeting |
| Suggested question chips | Click to send preset question |
| Message input | Type test message |
| **Send** button | `POST /onboarding/test-chat` *(real API; echo reply until chat orchestrator)* |
| Bot reply area | Read AI response |
| Debug panel (collapsible) | View RAG chunks + tool calls (owner only) |
| **Continue** | Enabled after ≥1 successful exchange |

---

### 4.6 Step 6 — Widget embed (`/onboarding/widget`)

| UI element | User actions |
|------------|--------------|
| Embed code block | **Copy to clipboard** |
| Live preview iframe | Open/close widget preview |
| Primary color preview | Read-only (edit later in Widget settings) |
| Install instructions | Expand setup steps per platform (Shopify, WordPress, HTML) |
| **Go to dashboard** | `PATCH /onboarding/step { complete }` → Dashboard |

---

## 5. Admin app — main screens

### 5.1 Dashboard home (`/dashboard`)

**Phase:** MVP · **Roles:** All

| UI element | User actions |
|------------|--------------|
| Messages today card | View count; click → Conversations filtered today |
| Messages this month card | View count vs limit; click → Usage |
| Active conversations card | View count; click → Conversations |
| Orders influenced card | View count (P2 analytics) |
| Channel status row | View WA / Web / Messenger / IG status; click → Channels |
| Knowledge sync status | View last sync; click → Knowledge |
| Quota usage bar | View % of message limit |
| Recent conversations table | Click row → Conversation thread |
| **Test your bot** shortcut | Open test simulator modal |
| Setup completion CTA | Resume onboarding if incomplete |

**APIs:** `GET /dashboard/stats` (live), `GET /tenants/me/usage`, `GET /channels` *(mock)*, `GET /knowledge/jobs`, `GET /conversations?limit=5`

---

### 5.2 Conversations — list (`/conversations`)

**Phase:** MVP · **Roles:** All (read)

| UI element | User actions |
|------------|--------------|
| Channel filter tabs | Filter: All, WhatsApp, Web, Messenger, IG |
| Date range picker | Filter by date |
| Status filter | Filter: Active, Closed |
| Search input (P3) | Full-text search conversations |
| Conversation table | Sort by last activity |
| Row: customer label | Click → Thread detail |
| Row: channel badge | Read channel type |
| Row: last message preview | Read snippet |
| Row: timestamp | Read last activity time |
| Pagination | Next / previous page |
| **Export CSV** (Pro, P2) | Download conversation list |

**APIs:** `GET /conversations?channel=&cursor=`

---

### 5.3 Conversations — thread (`/conversations/[id]`)

**Phase:** MVP · **Roles:** All (read); Admin+ (P3 reply)

| UI element | User actions |
|------------|--------------|
| Customer header | View masked ID, channel, name if known |
| Message timeline | Scroll history; load older messages |
| Inbound messages | Read shopper messages |
| Outbound messages | Read bot replies |
| Tool call badges | Expand to see `search_products`, `add_to_cart`, etc. |
| Cart summary sidebar | View current cart items + total |
| Order link | Open checkout URL if created |
| **Export thread** (P2) | Download CSV |
| **Take over** (P3) | Switch to human agent mode |
| **Reply input** (P3) | Type manual reply → send via channel |
| **Return to bot** (P3) | Resume AI handling |
| Internal notes (P3) | Add note (not sent to customer) |

**APIs:** `GET /conversations/{id}`, `GET /conversations/{id}/messages`

---

### 5.4 Knowledge — sources list (`/knowledge`)

**Phase:** MVP · **Roles:** Owner, Admin (edit); Viewer (read)

| UI element | User actions |
|------------|--------------|
| **Add source** button | Open add-source dialog |
| Source cards/table | View type, name, status, chunk count, last sync |
| Website source row | **Re-sync** · **Edit URL** · **Delete** |
| Catalog source row | **Re-sync** · **Replace file** · **Delete** |
| FAQ source row | **Edit** → FAQ editor |
| Conversation source row (P2) | **Upload** · **Re-sync** · **Delete** |
| Social source row (P2) | **Upload** · **Delete** |
| Job status indicator | View running / failed / completed |
| **View job details** | Open job detail drawer |
| Empty state | Click **Add your website** CTA |

**APIs:** `GET /knowledge/sources`, `POST /knowledge/sources/{id}/sync`, `DELETE /knowledge/sources/{id}`

---

### 5.5 Knowledge — add source dialog (modal)

**Phase:** MVP · **Roles:** Owner, Admin

| UI element | User actions |
|------------|--------------|
| Source type tabs | Select: Website, Catalog, FAQ |
| Website form | Enter URL, max depth → **Create & sync** |
| Catalog upload | Drag file → **Upload & sync** |
| FAQ editor | Add/edit/delete Q&A rows → **Save** |
| **Cancel** | Close without saving |

---

### 5.6 Knowledge — job detail (drawer)

**Phase:** MVP · **Roles:** Owner, Admin

| UI element | User actions |
|------------|--------------|
| Job status badge | View queued / running / completed / failed |
| Stats | View pages, chunks, tokens, duration |
| Error log | View failed URLs / rows |
| **Retry** | Re-queue failed job |
| **Close** | Close drawer |

**APIs:** `GET /knowledge/jobs/{jobId}`

---

### 5.7 Bot configuration (`/bot`)

**Phase:** MVP · **Roles:** Owner, Admin (edit); Viewer (read)

| UI element | User actions |
|------------|--------------|
| System prompt textarea | Edit prompt; insert `{{storeName}}` variable |
| Greeting message input | Edit widget/channel greeting |
| Handoff message input (P3) | Edit message when escalating to human |
| Suggested questions tag input | Add/remove widget quick-reply chips |
| LLM model dropdowns (P2) | Select model per intent (plan-gated) |
| Enabled channels toggles | Enable/disable per channel |
| **Save changes** | `PATCH /tenants/me/config` |
| **Reset to default** | Confirm → restore default prompts |
| **Test in simulator** | Open test chat modal with unsaved preview (P2) |

---

### 5.8 Channels (`/channels`)

**Phase:** MVP · **Roles:** Owner, Admin (edit); Viewer (read)

| UI element | User actions |
|------------|--------------|
| WhatsApp card | **Connect** / **Reconnect** / **Disconnect** |
| Messenger card (P2) | **Connect** / **Disconnect** |
| Instagram card (P2) | **Connect** / **Disconnect** |
| Web widget card | View always-on status |
| Connection health | View green/red + last health check |
| Connected phone / page name | Read asset details |
| **Send test message** | Send WA test to merchant number |
| WhatsApp templates table (P2) | View approved templates; sync list |
| Token expiry warning | **Reconnect** when token near expiry |
| Meta OAuth error banner | **Retry connect** |

**APIs:** `GET /channels`, `POST /channels/meta/connect`, `DELETE /channels/meta/{channel}`, `GET /channels/meta/health`

---

### 5.9 Widget settings (`/widget`)

**Phase:** MVP · **Roles:** Owner, Admin (edit); Viewer (read)

| UI element | User actions |
|------------|--------------|
| Embed code block | **Copy code** |
| Live preview | Toggle widget open/close in preview pane |
| Primary color picker | Change color → `PATCH /tenants/me/config` |
| Position select | bottom-right / bottom-left |
| Avatar upload | Upload bot avatar image |
| Suggested questions | Edit quick questions (synced with Bot config) |
| Domain allowlist (Pro, P2) | Add/remove allowed domains |
| API key display | View key prefix (masked) |
| **Regenerate API key** | Confirm modal → `POST /tenants/me/widget/regenerate-key` (shows key once) |
| Install guide tabs | Shopify / WooCommerce / HTML instructions |

---

### 5.10 Test simulator (modal / `/bot/test`)

**Phase:** MVP · **Roles:** Owner, Admin

| UI element | User actions |
|------------|--------------|
| Chat transcript | View message history |
| Input + Send | Send test message → `POST /api/v1/chat` |
| Channel selector | Simulate as `web` or `whatsapp` |
| Debug panel | Toggle RAG chunks, tool calls, latency, token usage |
| **Clear conversation** | Reset test session |
| **Close** | Close modal |

---

### 5.11 Usage (`/usage`)

**Phase:** MVP · **Roles:** All

| UI element | User actions |
|------------|--------------|
| Current period selector | Switch month |
| Messages used / limit | View progress bar |
| Token usage breakdown | View input/output tokens |
| Ingest jobs count | View jobs this period |
| Estimated LLM cost | View USD estimate |
| Storage used | View MB used |
| **Upgrade plan** (P2) | Navigate to Billing |

**APIs:** `GET /tenants/me/usage`, `GET /tenants/me/limits`

---

### 5.12 Billing (`/billing`)

**Phase:** P2 · **Roles:** Owner only

| UI element | User actions |
|------------|--------------|
| Current plan card | View plan name, price, renewal date |
| **Upgrade plan** button | Select plan → Stripe Checkout |
| **Manage billing** button | Open Stripe Customer Portal |
| Usage vs plan limits | View overage risk |
| Invoice history link | Open portal invoices |
| Cancel subscription (P2) | Confirm → cancel at period end |

**APIs:** `GET /billing/subscription`, `POST /billing/checkout`, `POST /billing/portal`

---

### 5.13 Analytics (`/analytics`)

**Phase:** P2 · **Roles:** All

| UI element | User actions |
|------------|--------------|
| Date range picker | Change reporting window |
| Messages over time chart | Hover tooltips; filter by channel |
| Intent breakdown pie | View FAQ / product / checkout split |
| Top products searched | Click product → Conversations filtered |
| Conversion funnel | View conversations → cart → checkout |
| Response latency chart | View p50 / p95 |
| **Export report** (P2) | Download PDF/CSV |

**APIs:** `GET /admin/analytics?from=&to=`

---

### 5.14 Settings — Profile (`/settings/profile`)

**Phase:** MVP · **Roles:** All (own profile)

| UI element | User actions |
|------------|--------------|
| Name input | Edit display name |
| Email display | Read-only |
| **Change password** | Navigate to change password form |
| **Save** | Update profile (P2 API) |

---

### 5.15 Settings — Store (`/settings/store`)

**Phase:** MVP · **Roles:** Owner, Admin

| UI element | User actions |
|------------|--------------|
| Store name | Edit → `PATCH /tenants/me` |
| Timezone | Edit via `TimezoneSelect` → `PATCH /tenants/me` |
| Logo | Upload / remove |
| Default language | Edit |
| Commerce connector type | Select manual / Shopify (P3) |
| Checkout base URL | Edit manual checkout URL |
| **Save** | Submit changes |

---

### 5.16 Settings — Team (`/settings/team`)

**Phase:** MVP · **Roles:** Owner, Admin (invite); Owner (remove)

| UI element | User actions |
|------------|--------------|
| Team members table | View name, email, role, status, last login |
| **Invite member** button | Open invite dialog |
| Invite dialog — email | Enter email |
| Invite dialog — role | Select admin / viewer |
| Invite dialog — **Send invite** | `POST /auth/invite` |
| Pending invites list | **Resend** · **Revoke** (P2) |
| Member row — **Remove** | Confirm → `DELETE /team/{userId}` (owner only) |
| Member row — **Change role** (P2) | Promote/demote admin ↔ viewer |

---

### 5.17 Settings — Security (`/settings/security`)

**Phase:** P2 (MFA) · **Roles:** All (own MFA); Owner (tenant policies)

| UI element | User actions |
|------------|--------------|
| MFA status | View enabled/disabled |
| **Enable TOTP** | Scan QR → enter code → `POST /auth/mfa/totp/enroll` + confirm |
| **Enable email OTP** | Toggle email MFA |
| Backup codes | **View / regenerate** backup codes (shown once) |
| **Disable MFA** | Confirm → `POST /auth/mfa/disable` |
| Active sessions list (P2) | **Revoke session** |
| SMS MFA (P3, Enterprise) | Enable SMS OTP via Twilio |

---

### 5.18 Settings — API keys (`/settings/api-keys`)

**Phase:** MVP · **Roles:** Owner, Admin

| UI element | User actions |
|------------|--------------|
| Widget API key | View prefix; **Copy** |
| **Regenerate key** | Confirm → show new key once + embed snippet (`API_PUBLIC_URL` + `/widget/v1.js`) |
| Embed snippet block | **Copy embed code** (shown after regenerate) |
| Key created date | Read metadata |
| Grace period notice | Read 24h dual-key note after rotation |

---

### 5.19 Settings — Notifications (`/settings/notifications`)

**Phase:** P2 · **Roles:** Owner, Admin

| UI element | User actions |
|------------|--------------|
| Email toggles | Enable/disable: ingest failed, token expired, quota alerts, payment failed |
| Digest frequency | Instant / daily digest for new conversations (Pro) |
| **Save preferences** | Update notification settings |

---

### 5.20 Settings — Data & privacy (`/settings/data`)

**Phase:** MVP (export) / P2 (delete) · **Roles:** Owner only

| UI element | User actions |
|------------|--------------|
| **Export all data** | Request GDPR export → email download link |
| Message retention display | View plan retention period |
| **Delete account** | Multi-step confirm → schedule tenant deletion |
| Deletion status | View countdown / cancel deletion (P2) |

---

### 5.21 Agent inbox (`/inbox`)

**Phase:** P3 · **Roles:** Owner, Admin

| UI element | User actions |
|------------|--------------|
| Needs attention queue | Filter conversations with `handoff_requested` |
| Real-time list | Auto-refresh; sound notification (optional) |
| Conversation preview | Click → Thread with takeover enabled |
| **Assign to me** | Claim conversation |
| **Mark resolved** | Return to bot |
| Canned replies (P3) | Insert template response |

---

### 5.22 Commerce — Shopify connect (`/settings/integrations/shopify`)

**Phase:** P3 · **Roles:** Owner, Admin

| UI element | User actions |
|------------|--------------|
| Connect status | View connected shop domain |
| **Connect Shopify** | OAuth → authorize app |
| **Disconnect** | Revoke integration |
| Sync status | View last catalog sync; **Sync now** |
| Product count | View synced SKU count |

---

## 6. Web widget (shopper UI)

Embedded on merchant site. Not part of admin app.

### 6.1 Chat bubble (minimized)

**Phase:** MVP · **Users:** Shoppers

| UI element | User actions |
|------------|--------------|
| Floating bubble (60×60) | **Click** → expand chat window |
| Unread badge | View unread count |
| Pulse animation | First-visit attention (optional) |

---

### 6.2 Chat window (expanded)

**Phase:** MVP · **Users:** Shoppers

| UI element | User actions |
|------------|--------------|
| Header — store name | Read store identity |
| **Close** button | Minimize to bubble |
| Greeting message | Read bot greeting on open |
| Suggested question chips | **Click** → send as message (from widget config) |
| Message list | Scroll transcript; bot text renders **bold**, list line breaks, `\n` |
| Product action chips | **Click** under bot reply when API returns `suggestedActions` (e.g. after `search_products`) |
| Product card messages (P2) | **Add to cart** · **View details** (rich cards not in `v1.js` yet) |
| Checkout link message | **Open checkout** (external tab) |
| Text input | Type message |
| **Send** button / Enter | Send message → `POST /widget/chat` |
| Typing indicator | View bot is typing |
| Error toast | Retry on failure |
| Loading state | Wait for streaming tokens (P2 SSE) |

---

### 6.3 Widget — mobile full-screen

**Phase:** MVP

| UI element | User actions |
|------------|--------------|
| Full-screen layout | Same actions as chat window |
| **Back / close** | Minimize widget |

---

## 7. Cross-cutting modals & states

| Modal / state | Trigger | User actions |
|---------------|---------|--------------|
| **Confirm delete source** | Delete on Knowledge | Cancel · **Delete** |
| **Confirm regenerate API key** | Widget / API keys settings | Cancel · **Regenerate** |
| **Confirm disconnect channel** | Channels page | Cancel · **Disconnect** |
| **Confirm remove team member** | Team settings | Cancel · **Remove** |
| **Confirm delete account** | Data settings | Type store name · **Delete** |
| **Session expired** | 401 on API call | **Log in again** |
| **Quota exceeded** | 422 on chat | View message · **Upgrade** (P2) |
| **Maintenance banner** | Platform-wide | Read-only notice |
| **Meta token expired alert** | Dashboard banner | **Reconnect** → Channels |

---

## 8. Screen index (quick reference)

| # | Screen | Route | Phase | Primary actions |
|---|--------|-------|-------|-----------------|
| 1 | Marketing home | `/` | P2 | Sign up, view pricing |
| 2 | Sign up | `/signup` | MVP | Create account |
| 3 | Log in | `/login` | MVP | Authenticate |
| 4 | Verify email | `/verify-email` | MVP | Confirm email |
| 5 | Forgot / reset password | `/forgot-password`, `/reset-password` | MVP | Reset credentials |
| 6 | Accept invite | `/accept-invite` | MVP | Join team |
| 7 | Onboarding (6 steps) | `/onboarding/*` | MVP | Configure store |
| 8 | Dashboard | `/dashboard` | MVP | View stats, shortcuts |
| 9 | Conversations list | `/conversations` | MVP | Browse, filter |
| 10 | Conversation thread | `/conversations/[id]` | MVP | Read history |
| 11 | Knowledge | `/knowledge` | MVP | Manage sources |
| 12 | Bot config | `/bot` | MVP | Edit prompts |
| 13 | Channels | `/channels` | MVP | Connect Meta |
| 14 | Widget settings | `/widget` | MVP | Copy embed, style |
| 15 | Test simulator | modal | MVP | Test bot |
| 16 | Usage | `/usage` | MVP | View quotas |
| 17 | Billing | `/billing` | P2 | Subscribe, manage |
| 18 | Analytics | `/analytics` | P2 | View charts |
| 19 | Settings (6 sub-pages) | `/settings/*` | MVP–P3 | Profile, team, security |
| 20 | Agent inbox | `/inbox` | P3 | Human handoff |
| 21 | Shopify integration | `/settings/integrations/shopify` | P3 | Connect store |
| 22 | Web widget (shopper) | embedded | MVP | Chat, buy |

---

## 9. MVP build order (UI)

Recommended sequence aligned with [03-task-plan.md](03-task-plan.md):

| Order | Screens | Sprint |
|-------|---------|--------|
| 1 | Login, Signup, Verify email | Sprint 1 |
| 2 | Onboarding steps 1–3 | Sprint 2 |
| 3 | Bot config + Test simulator | Sprint 3 |
| 4 | Channels + Conversations | Sprint 4 |
| 5 | Onboarding 4–6 + Widget settings + Dashboard | Sprint 5 |
| 6 | Knowledge (full) + Usage + Settings (team, API keys) | Sprint 5 |

**Defer to P2:** Billing, Analytics, MFA security, Marketing site, Notifications settings.  
**Defer to P3:** Agent inbox, Shopify, conversation search, manual reply.

---

## 10. Jetwing component mapping

| CommerceChat screen | Jetwing reference |
|--------------------|-------------------|
| Login | `app/login/page.tsx` |
| Dashboard | `app/dashboard/page.tsx` |
| Conversations list | `app/leads/page.tsx` |
| Thread detail | `app/leads/[id]/page.tsx` |
| Onboarding wizard | `app/leads/create/page.tsx` |
| Team settings | `components/settings/UsersCRUD.tsx` |
| All shadcn primitives | `components/ui/*` |
