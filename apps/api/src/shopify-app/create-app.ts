import express from "express";
import {
  ApiVersion,
  DeliveryMethod,
  LogSeverity,
  shopifyApi,
} from "@shopify/shopify-api";
import "@shopify/shopify-api/adapters/node";
import { DynamoSessionStorage, claimOAuthCode, releaseOAuthCode } from "./dynamo-session-storage";
import {
  buildAuthorizeUrl,
  consumeOAuthState,
  createOfflineSession,
  exchangeOAuthCode,
  newOAuthState,
  sanitizeShopDomain,
  saveOAuthState,
  verifyOAuthCallbackHmac,
} from "./oauth";

const BASE_PATH = "/shopify-app";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shopifyPageShell(title: string, body: string) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <script>
    if (window.top !== window.self) { window.top.location.href = window.location.href; }
  </script>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 520px; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
    label { display: block; margin: 1rem 0 0.25rem; font-weight: 600; }
    input { width: 100%; padding: 0.5rem; box-sizing: border-box; }
    button, .btn { display: inline-block; margin-top: 1.25rem; padding: 0.6rem 1.2rem; background: #111; color: #fff; border: 0; cursor: pointer; text-decoration: none; border-radius: 4px; }
    p { color: #555; }
  </style>
</head>
<body>${body}</body>
</html>`;
}

function shopifyConfig() {
  const apiKey = process.env.SHOPIFY_API_KEY ?? "";
  const apiSecret = process.env.SHOPIFY_API_SECRET ?? "";
  const scopes = (process.env.SHOPIFY_SCOPES ?? "read_products,read_orders,write_script_tags").split(",");
  const apiPublicUrl = (process.env.API_PUBLIC_URL ?? "").replace(/\/$/, "");
  const appUrl = (process.env.SHOPIFY_APP_URL ?? `${apiPublicUrl}${BASE_PATH}`).replace(/\/$/, "");
  const commerceChatApiUrl = apiPublicUrl;
  return { apiKey, apiSecret, scopes, appUrl, commerceChatApiUrl, configured: Boolean(apiKey && apiSecret && apiPublicUrl) };
}

async function commerceChatConnect(
  commerceChatApiUrl: string,
  shopDomain: string,
  accessToken: string,
  apiKey: string
) {
  const res = await fetch(`${commerceChatApiUrl}/api/v1/commerce/shopify/connect-store`, {
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

async function ensureWidgetScriptTag(
  shopify: ReturnType<typeof shopifyApi>,
  session: { shop: string; accessToken: string },
  apiKey: string,
  commerceChatApiUrl: string
) {
  const client = new shopify.clients.Rest({ session: session as never });
  const bootstrapRes = await fetch(`${commerceChatApiUrl}/api/v1/commerce/shopify/widget-bootstrap`, {
    headers: { "X-API-Key": apiKey },
  });
  const bootstrap = (await bootstrapRes.json()) as {
    data?: { widgetScriptUrl?: string; apiPublicUrl?: string };
  };
  const widgetCdn = (process.env.WIDGET_CDN_URL ?? "").replace(/\/$/, "");
  const scriptUrl =
    bootstrap.data?.widgetScriptUrl ??
    (widgetCdn ? `${widgetCdn}/widget/v1.js` : `${commerceChatApiUrl}/widget/v1.js`);
  const src = `${scriptUrl}?api_key=${encodeURIComponent(apiKey)}`;

  const existing = await client.get({ path: "script_tags" });
  const tags = (existing.body as { script_tags?: Array<{ id: number; src: string }> }).script_tags ?? [];
  const already = tags.some((t) => t.src.includes("commercechat") || t.src.includes("api_key="));
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
}

export function createShopifyApp() {
  const cfg = shopifyConfig();
  const app = express();
  app.use(express.json());

  if (!cfg.configured) {
    app.use(BASE_PATH, (_req, res) => {
      res.status(503).json({
        error: "Shopify app not configured. Set SHOPIFY_API_KEY and SHOPIFY_API_SECRET on the shopify-app Lambda.",
      });
    });
    return app;
  }

  const sessionStorage = new DynamoSessionStorage();
  const apiHost = new URL(cfg.commerceChatApiUrl || cfg.appUrl).host;

  const shopify = shopifyApi({
    apiKey: cfg.apiKey,
    apiSecretKey: cfg.apiSecret,
    scopes: cfg.scopes,
    hostName: apiHost,
    hostScheme: "https",
    apiVersion: ApiVersion.October24,
    isEmbeddedApp: false,
    logger: { level: LogSeverity.Warning },
    sessionStorage,
  });

  const router = express.Router();

  router.get("/health", (_req, res) => {
    res.json({ ok: true, appUrl: cfg.appUrl });
  });

  router.get("/", (req, res) => {
    const shop = sanitizeShopDomain(String(req.query.shop ?? ""));
    if (shop) {
      const params = new URLSearchParams({ shop });
      if (typeof req.query.host === "string") params.set("host", req.query.host);
      res.redirect(`${cfg.appUrl}/app?${params.toString()}`);
      return;
    }
    res.redirect(`${cfg.appUrl}/health`);
  });

  router.get("/app", async (req, res) => {
    const shop = sanitizeShopDomain(String(req.query.shop ?? ""));
    if (!shop) {
      res.status(400).type("html").send(
        shopifyPageShell(
          "CommerceChat",
          "<h1>CommerceChat</h1><p>Missing shop parameter. Open this app from your Shopify admin.</p>"
        )
      );
      return;
    }

    const sessionId = shopify.session.getOfflineId(shop);
    const session = await sessionStorage.loadSession(sessionId);
    const authParams = new URLSearchParams({ shop });
    if (typeof req.query.host === "string") authParams.set("host", req.query.host);
    const authUrl = `${cfg.appUrl}/auth?${authParams.toString()}`;

    if (!session?.accessToken) {
      res.status(200).type("html").send(
        shopifyPageShell(
          "CommerceChat",
          `<h1>CommerceChat</h1>
          <p>Authorize CommerceChat to access your Shopify store (products and chat widget).</p>
          <a class="btn" href="${escapeHtml(authUrl)}">Authorize app</a>`
        )
      );
      return;
    }

    res.status(200).type("html").send(
      shopifyPageShell(
        "CommerceChat",
        `<h1>CommerceChat</h1>
        <p>Paste your CommerceChat widget API key from the admin dashboard (Settings → API keys).</p>
        <form method="POST" action="${cfg.appUrl}/app/connect">
          <input type="hidden" name="shop" value="${escapeHtml(shop)}" />
          <label for="apiKey">Widget API key</label>
          <input id="apiKey" name="apiKey" type="password" placeholder="pk_live_..." required />
          <button type="submit">Connect store</button>
        </form>`
      )
    );
  });

  router.get("/auth", async (req, res) => {
    try {
      const shop = sanitizeShopDomain(String(req.query.shop ?? ""));
      if (!shop) {
        res.status(400).send("Missing or invalid shop parameter");
        return;
      }

      const existing = await sessionStorage.loadSession(shopify.session.getOfflineId(shop));
      if (existing?.accessToken) {
        res.redirect(`${cfg.appUrl}/app?shop=${encodeURIComponent(shop)}`);
        return;
      }

      const state = newOAuthState();
      await saveOAuthState(state, shop);

      const redirectUri = `${cfg.appUrl}/auth/callback`;
      const authorizeUrl = buildAuthorizeUrl({
        shop,
        apiKey: cfg.apiKey,
        scopes: cfg.scopes,
        redirectUri,
        state,
      });

      res.redirect(authorizeUrl);
    } catch (err) {
      console.error("Shopify OAuth begin failed", err);
      if (!res.headersSent) {
        res.status(500).send(err instanceof Error ? err.message : "OAuth begin failed");
      }
    }
  });

  router.get("/auth/callback", async (req, res) => {
    const shop = sanitizeShopDomain(String(req.query.shop ?? ""));
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const host = typeof req.query.host === "string" ? req.query.host : undefined;

    const redirectToApp = (shopDomain: string) => {
      if (res.headersSent) return;
      const params = new URLSearchParams({ shop: shopDomain });
      if (host) params.set("host", host);
      res.redirect(`${cfg.appUrl}/app?${params.toString()}`);
    };

    try {
      if (!shop || !code || !state) {
        if (!res.headersSent) res.status(400).send("Missing shop, code, or state");
        return;
      }

      const queryParams = Object.fromEntries(
        Object.entries(req.query).map(([k, v]) => [k, Array.isArray(v) ? v[0] : String(v ?? "")])
      ) as Record<string, string>;

      if (!verifyOAuthCallbackHmac(queryParams, cfg.apiSecret)) {
        if (!res.headersSent) res.status(400).send("Invalid OAuth signature");
        return;
      }

      const existing = await sessionStorage.loadSession(shopify.session.getOfflineId(shop));
      if (existing?.accessToken) {
        redirectToApp(shop);
        return;
      }

      const stateOk = await consumeOAuthState(state, shop);
      if (!stateOk) {
        if (!res.headersSent) res.status(400).send("Invalid or expired OAuth state. Try authorizing again.");
        return;
      }

      const claimed = await claimOAuthCode(code);
      if (!claimed) {
        const again = await sessionStorage.loadSession(shopify.session.getOfflineId(shop));
        if (again?.accessToken) {
          redirectToApp(shop);
          return;
        }
        if (!res.headersSent) res.status(409).send("Install already in progress. Refresh in a moment.");
        return;
      }

      const { accessToken, scope } = await exchangeOAuthCode(shop, code, cfg.apiKey, cfg.apiSecret);
      const session = createOfflineSession(shop, accessToken, scope);
      await sessionStorage.storeSession(session);
      redirectToApp(shop);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Shopify OAuth callback failed", message);

      if (shop && /already used|authorization code was not found/i.test(message)) {
        const existing = await sessionStorage.loadSession(shopify.session.getOfflineId(shop));
        if (existing?.accessToken) {
          redirectToApp(shop);
          return;
        }
      }

      if (code) await releaseOAuthCode(code).catch(() => {});
      if (!res.headersSent) {
        res.status(500).send(
          `OAuth failed. <a href="${cfg.appUrl}/auth?shop=${encodeURIComponent(shop ?? "")}">Try again</a>`
        );
      }
    }
  });

  router.post("/app/connect", express.urlencoded({ extended: true }), async (req, res) => {
    const shop = sanitizeShopDomain(String(req.body.shop ?? ""));
    const apiKey = String(req.body.apiKey ?? "").trim();
    if (!shop || !apiKey) {
      res.status(400).send("Shop and API key are required");
      return;
    }

    const sessionId = shopify.session.getOfflineId(shop);
    const session = await sessionStorage.loadSession(sessionId);
    if (!session?.accessToken) {
      res.redirect(`${cfg.appUrl}/auth?shop=${encodeURIComponent(shop)}`);
      return;
    }

    try {
      await commerceChatConnect(cfg.commerceChatApiUrl, shop, session.accessToken, apiKey);
      await ensureWidgetScriptTag(shopify, { shop, accessToken: session.accessToken }, apiKey, cfg.commerceChatApiUrl);
      res.setHeader("Content-Type", "text/html");
      res.send(`<!DOCTYPE html><html><body style="font-family:system-ui;max-width:480px;margin:2rem auto">
        <h1>Connected</h1>
        <p>Your Shopify store is linked to CommerceChat. Open <strong>Knowledge → Shopify</strong> in the admin and click <strong>Sync products</strong>.</p>
        <p><a href="${cfg.appUrl}/app?shop=${encodeURIComponent(shop)}">Back</a></p>
      </body></html>`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connect failed";
      res.status(500).send(message);
    }
  });

  router.post("/webhooks", express.text({ type: "*/*" }), async (req, res) => {
    try {
      await shopify.webhooks.process({
        rawBody: req.body,
        rawRequest: req,
        rawResponse: res,
      });
    } catch {
      res.status(500).send("Webhook error");
    }
  });

  shopify.webhooks.addHandlers({
    APP_UNINSTALLED: {
      deliveryMethod: DeliveryMethod.Http,
      callbackUrl: `${BASE_PATH}/webhooks`,
      callback: async (_topic, shop) => {
        const sessionId = shopify.session.getOfflineId(shop);
        await sessionStorage.deleteSession(sessionId);
      },
    },
  });

  app.use(BASE_PATH, router);
  return app;
}
