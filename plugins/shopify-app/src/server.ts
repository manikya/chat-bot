import express from "express";
import {
  ApiVersion,
  LogSeverity,
  shopifyApi,
  DeliveryMethod,
} from "@shopify/shopify-api";
import "@shopify/shopify-api/adapters/node";
import { MemorySessionStorage } from "./session-storage.js";

const PORT = Number(process.env.PORT ?? 3456);
const API_KEY = process.env.SHOPIFY_API_KEY ?? "";
const API_SECRET = process.env.SHOPIFY_API_SECRET ?? "";
const SCOPES = (process.env.SHOPIFY_SCOPES ?? "read_products,read_orders,write_script_tags").split(",");
const HOST = (process.env.SHOPIFY_APP_URL ?? `http://localhost:${PORT}`).replace(/\/$/, "");
const COMMERCECHAT_API_URL = (process.env.COMMERCECHAT_API_URL ?? "").replace(/\/$/, "");

if (!API_KEY || !API_SECRET) {
  console.error("Set SHOPIFY_API_KEY and SHOPIFY_API_SECRET in .env");
  process.exit(1);
}

const sessionStorage = new MemorySessionStorage();

const shopify = shopifyApi({
  apiKey: API_KEY,
  apiSecretKey: API_SECRET,
  scopes: SCOPES,
  hostName: new URL(HOST).host,
  hostScheme: new URL(HOST).protocol.replace(":", "") as "http" | "https",
  apiVersion: ApiVersion.October24,
  isEmbeddedApp: true,
  logger: { level: LogSeverity.Warning },
  sessionStorage,
});

const app = express();
app.use(express.json());

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function commerceChatConnect(shopDomain: string, accessToken: string, apiKey: string) {
  if (!COMMERCECHAT_API_URL) {
    throw new Error("COMMERCECHAT_API_URL is not configured");
  }
  const res = await fetch(`${COMMERCECHAT_API_URL}/api/v1/commerce/shopify/connect-store`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({ shopDomain, accessToken }),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!res.ok) {
    throw new Error(body.error?.message ?? `CommerceChat connect failed (${res.status})`);
  }
}

async function ensureWidgetScriptTag(session: { shop: string; accessToken: string }, apiKey: string) {
  const client = new shopify.clients.Rest({ session: session as never });
  const bootstrapRes = await fetch(
    `${COMMERCECHAT_API_URL}/api/v1/commerce/shopify/widget-bootstrap`,
    { headers: { "X-API-Key": apiKey } }
  );
  const bootstrap = (await bootstrapRes.json()) as {
    data?: { widgetScriptUrl?: string; apiPublicUrl?: string };
  };
  const scriptUrl = bootstrap.data?.widgetScriptUrl ?? `${COMMERCECHAT_API_URL}/widget/v1.js`;
  const apiUrl = bootstrap.data?.apiPublicUrl ?? COMMERCECHAT_API_URL;

  const existing = await client.get({ path: "script_tags" });
  const tags = (existing.body as { script_tags?: Array<{ id: number; src: string }> }).script_tags ?? [];
  const src = `${scriptUrl}?cc=1`;
  const already = tags.some((t) => t.src.includes("commercechat") || t.src === src);
  if (!already) {
    await client.post({
      path: "script_tags",
      data: {
        script_tag: {
          event: "onload",
          src,
          display_scope: "online_store",
        },
      },
    });
  }

  // Store API key in shop metafield for script tag loader (theme can read via app embed later)
  await client.post({
    path: "metafields",
    data: {
      metafield: {
        namespace: "commercechat",
        key: "api_key",
        type: "single_line_text_field",
        value: apiKey,
      },
    },
  });

  return { scriptUrl, apiUrl };
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/auth", async (req, res) => {
  const shop = shopify.utils.sanitizeShop(req.query.shop as string, true);
  if (!shop) {
    res.status(400).send("Missing shop parameter");
    return;
  }
  await shopify.auth.begin({
    shop,
    callbackPath: "/auth/callback",
    isOnline: false,
    rawRequest: req,
    rawResponse: res,
  });
});

app.get("/auth/callback", async (req, res) => {
  const callback = await shopify.auth.callback({
    rawRequest: req,
    rawResponse: res,
  });
  const { session } = callback;
  if (!session) {
    res.status(500).send("OAuth failed");
    return;
  }
  res.redirect(`/app?shop=${encodeURIComponent(session.shop)}`);
});

app.get("/app", async (req, res) => {
  const shop = shopify.utils.sanitizeShop(req.query.shop as string, true);
  if (!shop) {
    res.status(400).send("Missing shop");
    return;
  }
  const sessionId = shopify.session.getOfflineId(shop);
  const session = await sessionStorage.loadSession(sessionId);
  if (!session?.accessToken) {
    res.redirect(`/auth?shop=${encodeURIComponent(shop)}`);
    return;
  }

  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>CommerceChat</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 520px; margin: 2rem auto; padding: 0 1rem; }
    label { display: block; margin: 1rem 0 0.25rem; font-weight: 600; }
    input { width: 100%; padding: 0.5rem; box-sizing: border-box; }
    button { margin-top: 1.25rem; padding: 0.6rem 1.2rem; background: #111; color: #fff; border: 0; cursor: pointer; }
    p { color: #555; line-height: 1.5; }
  </style>
</head>
<body>
  <h1>CommerceChat</h1>
  <p>Paste your CommerceChat widget API key from the admin dashboard (Settings → Widget). We will sync products and install the chat widget on your storefront.</p>
  <form method="POST" action="/app/connect">
    <input type="hidden" name="shop" value="${escapeHtml(shop)}" />
    <label for="apiKey">Widget API key</label>
    <input id="apiKey" name="apiKey" type="password" placeholder="pk_live_..." required />
    <button type="submit">Connect store</button>
  </form>
</body>
</html>`);
});

app.post("/app/connect", express.urlencoded({ extended: true }), async (req, res) => {
  const shop = shopify.utils.sanitizeShop(req.body.shop as string, true);
  const apiKey = String(req.body.apiKey ?? "").trim();
  if (!shop || !apiKey) {
    res.status(400).send("Shop and API key are required");
    return;
  }

  const sessionId = shopify.session.getOfflineId(shop);
  const session = await sessionStorage.loadSession(sessionId);
  if (!session?.accessToken) {
    res.redirect(`/auth?shop=${encodeURIComponent(shop)}`);
    return;
  }

  try {
    await commerceChatConnect(shop, session.accessToken, apiKey);
    await ensureWidgetScriptTag({ shop, accessToken: session.accessToken }, apiKey);
    res.setHeader("Content-Type", "text/html");
    res.send(`<!DOCTYPE html><html><body style="font-family:system-ui;max-width:480px;margin:2rem auto">
      <h1>Connected</h1>
      <p>Your Shopify store is linked to CommerceChat. Product sync runs from the CommerceChat admin — open Knowledge → Shopify and click <strong>Sync products</strong>, or trigger sync from the admin API.</p>
      <p><a href="/app?shop=${encodeURIComponent(shop)}">Back</a></p>
    </body></html>`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connect failed";
    res.status(500).send(message);
  }
});

app.post(
  "/webhooks",
  express.text({ type: "*/*" }),
  async (req, res) => {
    try {
      await shopify.webhooks.process({
        rawBody: req.body,
        rawRequest: req,
        rawResponse: res,
      });
    } catch {
      res.status(500).send("Webhook error");
    }
  }
);

shopify.webhooks.addHandlers({
  APP_UNINSTALLED: {
    deliveryMethod: DeliveryMethod.Http,
    callbackUrl: "/webhooks",
    callback: async (_topic, shop) => {
      const sessionId = shopify.session.getOfflineId(shop);
      await sessionStorage.deleteSession(sessionId);
    },
  },
});

app.listen(PORT, () => {
  console.log(`CommerceChat Shopify app listening on ${HOST} (port ${PORT})`);
});
