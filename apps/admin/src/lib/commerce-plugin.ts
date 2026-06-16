import { apiPublicBaseUrl } from "./onboarding-env";

/** WordPress plugin served from admin static assets. */
export const WOOCOMMERCE_PLUGIN_DOWNLOAD_URL = "/commercechat-connector.zip";

/** Legacy self-hosted Shopify app package. */
export const SHOPIFY_APP_DOWNLOAD_URL = "/commercechat-shopify-app.zip";

export const WOOCOMMERCE_PLUGIN_INSTALL_STEPS = [
  "Download the CommerceChat Connector plugin (.zip)",
  "In WordPress: Plugins → Add New → Upload Plugin → choose the zip → Install → Activate",
  "Go to Settings → CommerceChat (or WooCommerce → CommerceChat) → Generate API key",
  "Paste your store URL and API key below, then connect — use the toggle here to show or hide the chat widget",
] as const;

export const SHOPIFY_APP_INSTALL_STEPS = [
  "Copy your widget API key below (pk_live_…)",
  "Click Install in Shopify and approve the CommerceChat app",
  "In Shopify Admin, paste your API key on the CommerceChat connect screen",
  "Products sync automatically when you add or edit items in Shopify",
] as const;

export function normalizeShopDomain(input: string): string {
  const trimmed = input.trim().toLowerCase().replace(/\/+$/, "");
  if (!trimmed) return "";

  try {
    const host = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`).hostname;
    if (host.endsWith(".myshopify.com")) return host;
  } catch {
    /* ignore */
  }

  if (trimmed.endsWith(".myshopify.com")) return trimmed;
  return "";
}

export function shopifyAppInstallUrl(shopDomain: string): string {
  const shop = normalizeShopDomain(shopDomain);
  const base = `${apiPublicBaseUrl()}/shopify-app`;
  if (!shop) return `${base}/app`;
  return `${base}/auth?shop=${encodeURIComponent(shop)}`;
}
