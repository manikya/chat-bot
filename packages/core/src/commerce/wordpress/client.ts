import { ApiError, ErrorCodes } from "@commercechat/shared";
import type { CoreConfig } from "../../config";
import { buildWordPressWidgetScriptBase } from "./widget-script";
import type {
  WordPressCheckoutLineItem,
  WordPressCheckoutResult,
  WordPressCredentials,
  WordPressOrder,
  WordPressProductsPage,
  WordPressStatus,
} from "./types";

function normalizeSiteUrl(siteUrl: string): string {
  return siteUrl.replace(/\/+$/, "");
}

function apiBase(siteUrl: string): string {
  return `${normalizeSiteUrl(siteUrl)}/wp-json/commercechat/v1`;
}

async function wpRequest<T>(
  creds: WordPressCredentials,
  path: string,
  config: CoreConfig,
  options?: {
    method?: string;
    query?: Record<string, string | number | undefined>;
    body?: unknown;
  }
): Promise<T> {
  const url = new URL(`${apiBase(creds.siteUrl)}${path}`);
  const query = options?.query;
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: options?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${creds.apiKey}`,
        Accept: "application/json",
        ...(options?.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "WordPress request failed";
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, `Store unreachable: ${msg}`, 502);
  }

  const body = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };

  if (!res.ok) {
    const detail = (body as { error?: string; message?: string }).error
      ?? (body as { message?: string }).message
      ?? res.statusText;
    throw new ApiError(
      ErrorCodes.VALIDATION_ERROR,
      `WordPress API error (${res.status}): ${detail}`,
      res.status === 401 ? 401 : 502
    );
  }

  return body;
}

async function wpFetch<T>(
  creds: WordPressCredentials,
  path: string,
  config: CoreConfig,
  query?: Record<string, string | number | undefined>
): Promise<T> {
  return wpRequest<T>(creds, path, config, { query });
}

export async function pushWordPressCloudConfig(
  creds: WordPressCredentials,
  config: CoreConfig,
  options?: { widgetEnabled?: boolean }
): Promise<void> {
  const body: {
    apiPublicUrl: string;
    widgetScriptUrl: string;
    widgetEnabled?: boolean;
    adminUrl?: string;
  } = {
    apiPublicUrl: config.apiPublicUrl.replace(/\/$/, ""),
    widgetScriptUrl: buildWordPressWidgetScriptBase(config),
    adminUrl: config.appUrl.replace(/\/$/, ""),
  };
  if (typeof options?.widgetEnabled === "boolean") {
    body.widgetEnabled = options.widgetEnabled;
  }
  await wpRequest<{ ok: boolean }>(creds, "/register-cloud", config, {
    method: "POST",
    body,
  });
}

export async function fetchWordPressStatus(
  creds: WordPressCredentials,
  config: CoreConfig
): Promise<WordPressStatus> {
  return wpFetch<WordPressStatus>(creds, "/status", config);
}

export async function fetchWordPressProductsPage(
  creds: WordPressCredentials,
  config: CoreConfig,
  page: number,
  perPage = 50,
  since?: string
): Promise<WordPressProductsPage> {
  return wpFetch<WordPressProductsPage>(creds, "/products", config, {
    page,
    per_page: perPage,
    since,
  });
}

export async function fetchAllWordPressProducts(
  creds: WordPressCredentials,
  config: CoreConfig,
  since?: string
): Promise<WordPressProductsPage["items"]> {
  const all: WordPressProductsPage["items"] = [];
  let page = 1;

  while (true) {
    const res = await fetchWordPressProductsPage(creds, config, page, 50, since);
    all.push(...res.items);
    if (!res.has_more || res.items.length === 0) break;
    page += 1;
    if (page > 200) break;
  }

  return all;
}

export async function fetchWordPressOrder(
  creds: WordPressCredentials,
  config: CoreConfig,
  orderId: number
): Promise<WordPressOrder> {
  return wpFetch<WordPressOrder>(creds, `/orders/${orderId}`, config);
}

export async function fetchWordPressOrdersByPhone(
  creds: WordPressCredentials,
  config: CoreConfig,
  phone: string,
  limit = 5
): Promise<{ orders: WordPressOrder[]; count: number }> {
  const res = await wpFetch<{ orders: WordPressOrder[]; count: number }>(
    creds,
    "/orders/by-phone",
    config,
    { phone, limit }
  );
  return res;
}

export async function createWordPressCheckout(
  creds: WordPressCredentials,
  config: CoreConfig,
  body: {
    cartId: string;
    conversationId: string;
    customerPhone?: string;
    lineItems: WordPressCheckoutLineItem[];
  }
): Promise<WordPressCheckoutResult> {
  return wpRequest<WordPressCheckoutResult>(creds, "/checkout", config, {
    method: "POST",
    body: {
      cart_id: body.cartId,
      conversation_id: body.conversationId,
      customer_phone: body.customerPhone,
      line_items: body.lineItems,
    },
  });
}

export function validateConnectBody(siteUrl: string, apiKey: string): WordPressCredentials {
  const trimmedUrl = siteUrl?.trim();
  const trimmedKey = apiKey?.trim();
  if (!trimmedUrl) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "siteUrl is required", 400);
  }
  if (!trimmedKey) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "apiKey is required", 400);
  }
  try {
    const u = new URL(trimmedUrl);
    if (u.protocol !== "https:" && u.protocol !== "http:") {
      throw new Error("invalid protocol");
    }
  } catch {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "siteUrl must be a valid URL", 400);
  }

  return {
    siteUrl: normalizeSiteUrl(trimmedUrl),
    apiKey: trimmedKey,
    updatedAt: new Date().toISOString(),
  };
}
