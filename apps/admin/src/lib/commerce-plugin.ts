/** WordPress plugin served from admin static assets. */
export const WOOCOMMERCE_PLUGIN_DOWNLOAD_URL = "/commercechat-connector.zip";

export const WOOCOMMERCE_PLUGIN_INSTALL_STEPS = [
  "Download the CommerceChat Connector plugin (.zip)",
  "In WordPress: Plugins → Add New → Upload Plugin → choose the zip → Install → Activate",
  "Go to Settings → CommerceChat (or WooCommerce → CommerceChat) → Generate API key",
  "Paste your store URL and API key below, then connect",
] as const;

export const SHOPIFY_APP_INSTALL_STEPS = [
  "Deploy the CommerceChat Shopify app from plugins/shopify-app (see README)",
  "Install on your store and authorize product read access",
  "Paste your CommerceChat widget API key in the app setup screen",
  "Return here and click Sync products to index your catalog",
] as const;
