import type { CoreConfig } from "../config";

function widgetScriptBase(config: CoreConfig): string {
  return (config.widgetCdnUrl ?? config.apiPublicUrl).replace(/\/$/, "");
}

export function buildWidgetEmbedCode(apiKey: string, config: CoreConfig) {
  const scriptUrl = `${widgetScriptBase(config)}/widget/v1.js`;
  const apiUrl = config.apiPublicUrl.replace(/\/$/, "");
  const legalBaseUrl = config.appUrl.replace(/\/$/, "");
  const onCdn = Boolean(config.widgetCdnUrl && scriptUrl.startsWith(config.widgetCdnUrl.replace(/\/$/, "")));
  const apiAttr = onCdn ? `\n  data-api-url="${apiUrl}"` : "";
  return `<script
  src="${scriptUrl}"
  data-api-key="${apiKey}"${apiAttr}
  data-legal-base-url="${legalBaseUrl}"
  async
></script>`;
}

export function buildWidgetEmbedPlaceholder(prefix: string, config: CoreConfig) {
  const scriptUrl = `${widgetScriptBase(config)}/widget/v1.js`;
  const apiUrl = config.apiPublicUrl.replace(/\/$/, "");
  const legalBaseUrl = config.appUrl.replace(/\/$/, "");
  const onCdn = Boolean(config.widgetCdnUrl && scriptUrl.startsWith(config.widgetCdnUrl.replace(/\/$/, "")));
  const apiAttr = onCdn ? `\n  data-api-url="${apiUrl}"` : "";
  return `<script
  src="${scriptUrl}"
  data-api-key="${prefix}…"${apiAttr}
  data-legal-base-url="${legalBaseUrl}"
  async
></script>
<!-- Regenerate your API key in Settings → API keys for the full embed snippet -->`;
}
