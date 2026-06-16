import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { DeleteCommand, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { Session } from "@shopify/shopify-api";
import { getDocClient, loadConfig } from "@commercechat/core";

const OAUTH_STATE_PK = "PLATFORM#SHOPIFY_OAUTH_STATE";

export function sanitizeShopDomain(shop: string): string | null {
  const trimmed = shop.trim().toLowerCase();
  if (!trimmed) return null;
  const domain = trimmed.includes(".") ? trimmed : `${trimmed}.myshopify.com`;
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain)) return null;
  return domain;
}

export async function saveOAuthState(state: string, shop: string): Promise<void> {
  const config = loadConfig();
  const db = getDocClient(config);
  await db.send(
    new PutCommand({
      TableName: config.tableName,
      Item: {
        PK: OAUTH_STATE_PK,
        SK: state,
        shop,
        createdAt: new Date().toISOString(),
      },
    })
  );
}

export async function consumeOAuthState(state: string, shop: string): Promise<boolean> {
  const config = loadConfig();
  const db = getDocClient(config);
  const res = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: OAUTH_STATE_PK, SK: state },
    })
  );
  if (!res.Item || res.Item.shop !== shop) return false;
  await db.send(
    new DeleteCommand({
      TableName: config.tableName,
      Key: { PK: OAUTH_STATE_PK, SK: state },
    })
  );
  return true;
}

export function verifyOAuthCallbackHmac(
  query: Record<string, string | undefined>,
  secret: string
): boolean {
  const hmac = query.hmac;
  if (!hmac) return false;

  const pairs = Object.entries(query)
    .filter(([key, value]) => key !== "hmac" && key !== "signature" && value != null && value !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`);

  const message = pairs.join("&");
  const digest = createHmac("sha256", secret).update(message).digest("hex");

  try {
    return timingSafeEqual(Buffer.from(digest, "utf8"), Buffer.from(hmac, "utf8"));
  } catch {
    return false;
  }
}

export function buildAuthorizeUrl(opts: {
  shop: string;
  apiKey: string;
  scopes: string[];
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(`https://${opts.shop}/admin/oauth/authorize`);
  url.searchParams.set("client_id", opts.apiKey);
  url.searchParams.set("scope", opts.scopes.join(","));
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("state", opts.state);
  return url.toString();
}

export async function exchangeOAuthCode(
  shop: string,
  code: string,
  apiKey: string,
  apiSecret: string
): Promise<{ accessToken: string; scope: string }> {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: apiKey,
      client_secret: apiSecret,
      code,
    }),
  });

  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !body.access_token) {
    throw new Error(body.error_description ?? body.error ?? `Token exchange failed (${res.status})`);
  }

  return { accessToken: body.access_token, scope: body.scope ?? "" };
}

export function createOfflineSession(shop: string, accessToken: string, scope: string): Session {
  const id = `offline_${shop}`;
  return new Session({
    id,
    shop,
    state: "active",
    isOnline: false,
    accessToken,
    scope,
  });
}

export function newOAuthState(): string {
  return randomBytes(16).toString("hex");
}
