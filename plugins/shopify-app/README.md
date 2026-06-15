# CommerceChat Shopify app

OAuth app that links a Shopify store to CommerceChat: saves the offline access token, calls the CommerceChat connect API, and installs the chat widget via a ScriptTag.

## Prerequisites

1. [Shopify Partner](https://partners.shopify.com) account and a custom app
2. CommerceChat tenant with a widget API key (`pk_live_…` from the admin dashboard)
3. Public HTTPS URL for local dev (e.g. ngrok) pointing at this server

## Setup

```bash
cd plugins/shopify-app
cp .env.example .env
# Fill SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_APP_URL, COMMERCECHAT_API_URL
npm install
npm run dev
```

In the Partner Dashboard:

- **App URL**: `https://your-tunnel/auth`
- **Allowed redirection URL(s)**: `https://your-tunnel/auth/callback`
- **Scopes**: `read_products`, `read_orders`, `write_script_tags`

Install on a development store: open `https://your-tunnel/auth?shop=your-store.myshopify.com`.

## Flow

1. Merchant installs the app → OAuth offline token stored in session storage
2. Merchant pastes CommerceChat widget API key on `/app`
3. App `POST`s to `COMMERCECHAT_API_URL/api/v1/commerce/shopify/connect-store` with `X-API-Key`
4. App creates a ScriptTag loading the CommerceChat widget
5. In CommerceChat admin → **Knowledge** → **Shopify** → **Sync products**

## Manual connect (no app)

For custom apps or testing, connect directly in the admin UI with shop domain + Admin API access token (`shpat_…`).

## Production notes

- Replace `MemorySessionStorage` with Redis or DynamoDB
- Register `APP_UNINSTALLED` webhook in Partner Dashboard → `https://your-host/webhooks`
- Prefer a Theme App Extension over ScriptTags for Online Store 2.0 long term
