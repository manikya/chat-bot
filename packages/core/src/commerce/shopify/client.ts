import { ApiError, ErrorCodes } from "@commercechat/shared";
import type { CoreConfig } from "../../config";
import type {
  ConnectShopifyBody,
  ShopifyCredentials,
  ShopifyProduct,
  ShopifyProductsPage,
  ShopifyShopStatus,
} from "./types";

const API_VERSION = "2024-10";

export function normalizeShopDomain(shop: string): string {
  let domain = shop.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  if (!domain.includes(".")) {
    domain = `${domain}.myshopify.com`;
  }
  return domain.toLowerCase();
}

export function validateConnectBody(shopDomain: string, accessToken: string): ShopifyCredentials {
  const shop = normalizeShopDomain(shopDomain);
  const token = accessToken.trim();
  if (!shop || !shop.endsWith(".myshopify.com")) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Invalid Shopify shop domain", 400);
  }
  if (!token) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Shopify access token is required", 400);
  }
  return {
    shopDomain: shop,
    accessToken: token,
    updatedAt: new Date().toISOString(),
  };
}

export function validateConnectShopifyBody(body: ConnectShopifyBody): ShopifyCredentials {
  return validateConnectBody(body.shopDomain, body.accessToken);
}

function adminUrl(creds: ShopifyCredentials, path: string): string {
  return `https://${creds.shopDomain}/admin/api/${API_VERSION}${path}`;
}

async function shopifyRequest<T>(
  creds: ShopifyCredentials,
  path: string,
  options?: {
    method?: string;
    query?: Record<string, string | number | undefined>;
    body?: unknown;
  }
): Promise<T> {
  const url = new URL(adminUrl(creds, path));
  if (options?.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    }
  }

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: options?.method ?? "GET",
      headers: {
        "X-Shopify-Access-Token": creds.accessToken,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Shopify request failed";
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, `Store unreachable: ${msg}`, 502);
  }

  const body = (await res.json().catch(() => ({}))) as T & {
    errors?: string | Record<string, unknown>;
  };

  if (!res.ok) {
    const detail =
      typeof body.errors === "string"
        ? body.errors
        : body.errors
          ? JSON.stringify(body.errors)
          : res.statusText;
    throw new ApiError(
      ErrorCodes.VALIDATION_ERROR,
      `Shopify API error (${res.status}): ${detail}`,
      res.status === 401 ? 401 : 502
    );
  }

  return body;
}

export async function fetchShopifyShop(
  creds: ShopifyCredentials,
  _config: CoreConfig
): Promise<ShopifyShopStatus> {
  const res = await shopifyRequest<{ shop: ShopifyShopStatus }>(creds, "/shop.json");
  return res.shop;
}

/** Returns false when Shopify rejects the offline access token (e.g. after app reinstall). */
export async function verifyShopifyAccessToken(creds: ShopifyCredentials): Promise<boolean> {
  try {
    await fetchShopifyShop(creds, {} as CoreConfig);
    return true;
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 401) return false;
    throw err;
  }
}

export async function fetchAllShopifyProducts(
  creds: ShopifyCredentials,
  config: CoreConfig
): Promise<ShopifyProduct[]> {
  const items: ShopifyProduct[] = [];
  let nextUrl: string | null = adminUrl(creds, "/products.json?limit=250&status=active");

  for (let page = 0; page < 40 && nextUrl; page++) {
    let res: Response;
    try {
      res = await fetch(nextUrl, {
        headers: {
          "X-Shopify-Access-Token": creds.accessToken,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(60_000),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Shopify request failed";
      throw new ApiError(ErrorCodes.VALIDATION_ERROR, `Store unreachable: ${msg}`, 502);
    }

    const body = (await res.json().catch(() => ({}))) as ShopifyProductsPage & {
      errors?: string;
    };
    if (!res.ok) {
      throw new ApiError(
        ErrorCodes.VALIDATION_ERROR,
        `Shopify API error (${res.status}): ${body.errors ?? res.statusText}`,
        res.status === 401 ? 401 : 502
      );
    }

    items.push(...(body.products ?? []));

    const link = res.headers.get("link");
    const match = link?.match(/<([^>]+)>;\s*rel="next"/);
    nextUrl = match?.[1] ?? null;
  }

  return items;
}

export async function fetchShopifyOrderByName(
  creds: ShopifyCredentials,
  config: CoreConfig,
  orderName: string
) {
  const res = await shopifyRequest<{ orders: Array<Record<string, unknown>> }>(
    creds,
    "/orders.json",
    { query: { status: "any", name: orderName, limit: 1 } }
  );
  return res.orders?.[0] ?? null;
}

const PRODUCT_WEBHOOK_TOPICS = ["products/create", "products/update", "products/delete"] as const;

export async function listShopifyWebhooks(creds: ShopifyCredentials, _config: CoreConfig) {
  const res = await shopifyRequest<{ webhooks: Array<{ id: number; topic: string; address: string }> }>(
    creds,
    "/webhooks.json"
  );
  return res.webhooks ?? [];
}

export async function createShopifyWebhook(
  creds: ShopifyCredentials,
  topic: string,
  address: string,
  config: CoreConfig
) {
  await shopifyRequest(creds, "/webhooks.json", {
    method: "POST",
    body: { webhook: { topic, address, format: "json" } },
  });
}

/** Register product catalog webhooks pointing at CommerceChat (idempotent). */
export async function ensureShopifyProductWebhooks(
  creds: ShopifyCredentials,
  callbackUrl: string,
  config: CoreConfig
) {
  const address = callbackUrl.replace(/\/$/, "");
  const existing = await listShopifyWebhooks(creds, config);
  for (const topic of PRODUCT_WEBHOOK_TOPICS) {
    const registered = existing.some((w) => w.topic === topic && w.address === address);
    if (!registered) {
      await createShopifyWebhook(creds, topic, address, config);
    }
  }
}
