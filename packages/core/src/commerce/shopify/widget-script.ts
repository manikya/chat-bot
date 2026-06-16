import type { CoreConfig } from "../../config";
import type { ShopifyCredentials } from "./types";

type ScriptTag = { id: number; src: string };

function adminUrl(creds: ShopifyCredentials, path: string): string {
  return `https://${creds.shopDomain}/admin/api/2024-10${path}`;
}

async function shopifyAdminFetch(
  creds: ShopifyCredentials,
  path: string,
  options?: { method?: string; body?: unknown }
): Promise<Response> {
  return fetch(adminUrl(creds, path), {
    method: options?.method ?? "GET",
    headers: {
      "X-Shopify-Access-Token": creds.accessToken,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
}

export function isCommerceChatScriptTag(src: string): boolean {
  return /widget\/v1\.js/i.test(src) && (src.includes("api_key=") || /commercechat/i.test(src));
}

export function buildWidgetScriptTagSrc(apiKey: string, config: CoreConfig): string {
  const commerceChatApiUrl = config.apiPublicUrl.replace(/\/$/, "");
  const widgetCdn = (config.widgetCdnUrl ?? "").replace(/\/$/, "");
  const scriptUrl = widgetCdn
    ? `${widgetCdn}/widget/v1.js`
    : `${commerceChatApiUrl}/widget/v1.js`;
  return (
    `${scriptUrl}?api_key=${encodeURIComponent(apiKey)}` +
    `&api_url=${encodeURIComponent(commerceChatApiUrl)}` +
    `&v=4`
  );
}

export async function listShopifyScriptTags(creds: ShopifyCredentials): Promise<ScriptTag[]> {
  const res = await shopifyAdminFetch(creds, "/script_tags.json");
  if (!res.ok) return [];
  const body = (await res.json().catch(() => ({}))) as { script_tags?: ScriptTag[] };
  return body.script_tags ?? [];
}

export async function deleteShopifyScriptTag(creds: ShopifyCredentials, id: number): Promise<void> {
  await shopifyAdminFetch(creds, `/script_tags/${id}.json`, { method: "DELETE" });
}

export async function createShopifyScriptTag(creds: ShopifyCredentials, src: string): Promise<void> {
  const res = await shopifyAdminFetch(creds, "/script_tags.json", {
    method: "POST",
    body: {
      script_tag: {
        event: "onload",
        src,
        display_scope: "online_store",
      },
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Shopify script tag create failed (${res.status}): ${body}`);
  }
}

export async function removeCommerceChatScriptTags(creds: ShopifyCredentials): Promise<number> {
  const tags = await listShopifyScriptTags(creds);
  let removed = 0;
  for (const tag of tags) {
    if (isCommerceChatScriptTag(tag.src)) {
      await deleteShopifyScriptTag(creds, tag.id);
      removed += 1;
    }
  }
  return removed;
}

export async function installCommerceChatScriptTag(
  creds: ShopifyCredentials,
  widgetApiKey: string,
  config: CoreConfig
): Promise<void> {
  const src = buildWidgetScriptTagSrc(widgetApiKey, config);
  const tags = await listShopifyScriptTags(creds);
  const existing = tags.find((t) => isCommerceChatScriptTag(t.src));
  if (existing?.src === src) return;
  if (existing) await deleteShopifyScriptTag(creds, existing.id);
  await createShopifyScriptTag(creds, src);
}

export async function syncCommerceChatScriptTag(
  creds: ShopifyCredentials,
  widgetApiKey: string | undefined,
  enabled: boolean,
  config: CoreConfig
): Promise<void> {
  if (!enabled) {
    await removeCommerceChatScriptTags(creds);
    return;
  }
  if (!widgetApiKey) {
    throw new Error("Widget API key is required to enable the chat widget on Shopify");
  }
  await installCommerceChatScriptTag(creds, widgetApiKey, config);
}
