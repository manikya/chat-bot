import { ApiError, ErrorCodes, ok } from "@commercechat/shared";

export type StorePlatform = "woocommerce" | "shopify" | "generic";

export interface StorePlatformDetection {
  platform: StorePlatform;
  normalizedUrl: string;
  signals: string[];
  commerceChatPluginInstalled: boolean;
}

function normalizeStoreUrl(input: string): string {
  let raw = input.trim();
  if (!raw) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Store URL is required", 400);
  }
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Enter a valid store URL", 400);
  }
  if (!parsed.hostname) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Enter a valid store URL", 400);
  }
  return `${parsed.protocol}//${parsed.host}`;
}

async function fetchText(url: string, timeoutMs = 12_000): Promise<{ text: string; headers: Headers }> {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": "CommerceChatBot/1.0 (+https://commercechat.com)",
      Accept: "text/html,application/xhtml+xml,application/json",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = (await res.text()).slice(0, 200_000);
  return { text, headers: res.headers };
}

function detectShopify(htmlLower: string, url: string, headers: Headers): string[] {
  const signals: string[] = [];
  if (headers.get("x-shopid")) signals.push("Shopify store header");
  if (url.includes("myshopify.com")) signals.push("myshopify.com domain");
  for (const marker of ["cdn.shopify.com", "shopify.theme", "shopify-section", "shopify-features"]) {
    if (htmlLower.includes(marker)) signals.push(marker);
  }
  return signals;
}

function detectWooHtml(htmlLower: string): string[] {
  const signals: string[] = [];
  if (htmlLower.includes("woocommerce")) signals.push("WooCommerce assets");
  if (htmlLower.includes("/wp-content/plugins/woocommerce")) signals.push("WooCommerce plugin path");
  if (htmlLower.includes("wp-content")) signals.push("WordPress assets");
  if (htmlLower.includes("wordpress")) signals.push("WordPress generator");
  return signals;
}

export async function detectStorePlatform(rawUrl: string) {
  const normalizedUrl = normalizeStoreUrl(rawUrl);
  let htmlLower = "";
  let headers = new Headers();

  try {
    const home = await fetchText(normalizedUrl);
    htmlLower = home.text.toLowerCase();
    headers = home.headers;
  } catch {
    throw new ApiError(
      ErrorCodes.VALIDATION_ERROR,
      "Could not reach that URL — check the address and try again",
      400
    );
  }

  const shopifySignals = detectShopify(htmlLower, normalizedUrl.toLowerCase(), headers);
  if (shopifySignals.length > 0) {
    return ok<StorePlatformDetection>({
      platform: "shopify",
      normalizedUrl,
      signals: shopifySignals,
      commerceChatPluginInstalled: false,
    });
  }

  let commerceChatPluginInstalled = false;
  const wooSignals = detectWooHtml(htmlLower);

  try {
    const wpJson = await fetchText(`${normalizedUrl}/wp-json/`, 8_000);
    if (wpJson.text.includes("namespace") || wpJson.headers.get("content-type")?.includes("json")) {
      wooSignals.push("WordPress REST API");
    }
  } catch {
    /* not WordPress */
  }

  try {
    const plugin = await fetch(`${normalizedUrl}/wp-json/commercechat/v1/status`, {
      signal: AbortSignal.timeout(6_000),
    });
    if (plugin.ok) {
      commerceChatPluginInstalled = true;
      wooSignals.push("CommerceChat Connector plugin");
    }
  } catch {
    /* plugin not installed */
  }

  if (wooSignals.length > 0) {
    return ok<StorePlatformDetection>({
      platform: "woocommerce",
      normalizedUrl,
      signals: [...new Set(wooSignals)],
      commerceChatPluginInstalled,
    });
  }

  return ok<StorePlatformDetection>({
    platform: "generic",
    normalizedUrl,
    signals: ["Standard website — no WooCommerce or Shopify signals detected"],
    commerceChatPluginInstalled: false,
  });
}
