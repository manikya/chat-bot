import type { CoreConfig } from "../config";

export function buildWidgetEmbedCode(apiKey: string, config: CoreConfig) {
  const scriptUrl = `${config.apiPublicUrl.replace(/\/$/, "")}/widget/v1.js`;
  return `<script
  src="${scriptUrl}"
  data-api-key="${apiKey}"
  async
></script>`;
}

export function buildWidgetEmbedPlaceholder(prefix: string, config: CoreConfig) {
  const scriptUrl = `${config.apiPublicUrl.replace(/\/$/, "")}/widget/v1.js`;
  return `<script
  src="${scriptUrl}"
  data-api-key="${prefix}…"
  async
></script>
<!-- Regenerate your API key in Settings → API keys for the full embed snippet -->`;
}
