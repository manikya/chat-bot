/** WordPress plugin served from admin static assets. */
export const WOOCOMMERCE_PLUGIN_DOWNLOAD_URL = "/commercechat-connector.zip";

export const WOOCOMMERCE_PLUGIN_INSTALL_STEPS = [
  "Download the CommerceChat Connector plugin (.zip)",
  "In WordPress: Plugins → Add New → Upload Plugin → choose the zip → Install → Activate",
  "Go to Settings → CommerceChat (or WooCommerce → CommerceChat) → Generate API key",
  "Paste your store URL and API key below, then connect",
] as const;

export const SHOPIFY_APP_INSTALL_STEPS = [
  "Install CommerceChat from the Shopify App Store (coming soon)",
  "Authorize your store and approve product read access",
  "Return here — products sync automatically for AI answers",
  "Until the app is live, use “Crawl storefront” below to index public pages",
] as const;
