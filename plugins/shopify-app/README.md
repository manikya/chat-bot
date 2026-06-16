# CommerceChat Shopify app

Links a Shopify store to CommerceChat (OAuth, product sync, chat widget).

## Merchant setup (recommended)

Use the **serverless** app on your CommerceChat API — no separate Node server.

1. In CommerceChat admin, open **Knowledge → Shopify** (or onboarding when Shopify is detected).
2. **Copy your widget API key** (`pk_live_…`) from the connect card, or **Settings → API keys**.
3. Enter your **shop domain** (`your-store.myshopify.com`) and click **Install in Shopify**.
4. Approve the app in Shopify Admin, then **paste your API key** on the CommerceChat connect screen.
5. After connect you land on the app home with **Chat widget on storefront** toggle — on by default.
6. Products sync **automatically** when you add or edit items in Shopify. Use **Sync products** in admin for a full manual refresh.

Manual connect with an Admin API token (`shpat_…`) is available under **Advanced** in the same card (does not install the widget ScriptTag).

### Widget on/off

| Where | Action |
|-------|--------|
| **CommerceChat admin** → Knowledge → Shopify | **Chat widget on storefront** switch |
| **Shopify Admin** → Apps → CommerceChat | **Show chat widget on storefront** checkbox |

Off removes the ScriptTag from your theme; product sync continues.

### Troubleshooting

| Issue | Fix |
|-------|-----|
| Connect fails with **Shopify API 401** after reinstall | Open `{API}/shopify-app/auth?shop=STORE.myshopify.com&force=1` and re-authorize, then paste API key again |
| Bubble missing on storefront | Open the CommerceChat app or Knowledge → Shopify once (refreshes ScriptTag), then hard-refresh the store (`Cmd+Shift+R`) |
| Dawn theme / empty bubble | Fixed in widget `v1.js` — host is `<commercechat-root>`, not an empty `div` |
| Wrong store domain | Use `.myshopify.com` from **Settings → Domains**, not a custom domain only |

Password-protected preview stores: enter the storefront password before expecting the bubble.

---

## Operator setup: serverless (Lambda on existing API)

CommerceChat deploys this app as a **Lambda** on your existing API. You do **not** need to run Node on a VPS.

### 1. Add Partner credentials

In `apps/api/.env` (or `.env.aws`):

```env
SHOPIFY_API_KEY=your_partner_api_key
SHOPIFY_API_SECRET=your_partner_api_secret
```

### 2. Deploy API + widget CDN

```bash
npm run deploy:widget -- --env=dev
npm run deploy:aws -- --env=dev --with-ingest-pipeline --with-ingest-step-functions
```

Your app base URL becomes:

```
https://YOUR-API.execute-api.us-east-1.amazonaws.com/shopify-app
```

`SHOPIFY_APP_URL` is set automatically to `{API_PUBLIC_URL}/shopify-app`.

### 3. Configure Shopify Partner Dashboard

| Field | Value |
|--------|--------|
| **App URL** | `https://YOUR-API.../shopify-app/app` |
| **Allowed redirection URL(s)** | `https://YOUR-API.../shopify-app/auth/callback` |
| **Embed app in Shopify admin** | **Off** (non-embedded — avoids cookie/iframe errors) |
| **Scopes** | `read_products`, `read_orders`, `write_script_tags` |
| **App uninstalled webhook** (recommended) | `https://YOUR-API.../shopify-app/webhooks` |

### 4. Install on a store

```
https://YOUR-API.../shopify-app/auth?shop=STORE.myshopify.com
```

The merchant pastes their CommerceChat `pk_live_…` key when prompted (also shown in admin UI).

### 5. Webhooks

| Topic | Handler |
|-------|---------|
| `products/create`, `products/update`, `products/delete` | Queue debounced catalog sync |
| `app/uninstalled` | Clear OAuth session |

Registered on connect; repaired on manual **Sync products**.

---

## Alternative: self-hosted (zip)

Legacy zip at `apps/admin/public/commercechat-shopify-app.zip` if you want to run the app on your own server (Railway, VPS, ngrok for dev).

```bash
cd plugins/shopify-app
cp .env.example .env
npm install
npm run dev
```

Set `SHOPIFY_APP_URL` to your public HTTPS URL and `COMMERCECHAT_API_URL` to the CommerceChat API.

---

## Manual connect (no app)

In CommerceChat admin → **Knowledge → Shopify** → **Advanced**: connect with shop domain + Admin API token (`shpat_…`). Paste the widget embed in your theme manually — ScriptTag injection requires the OAuth app.
