import type { CoreConfig } from "../../config";

export function buildWordPressWidgetScriptBase(config: CoreConfig): string {
  const widgetCdn = (config.widgetCdnUrl ?? "").replace(/\/$/, "");
  const apiPublicUrl = config.apiPublicUrl.replace(/\/$/, "");
  return widgetCdn ? `${widgetCdn}/widget/v1.js` : `${apiPublicUrl}/widget/v1.js`;
}

export function buildWordPressWidgetScriptSrc(apiKey: string, config: CoreConfig): string {
  const commerceChatApiUrl = config.apiPublicUrl.replace(/\/$/, "");
  const scriptUrl = buildWordPressWidgetScriptBase(config);
  return (
    `${scriptUrl}?api_key=${encodeURIComponent(apiKey)}` +
    `&api_url=${encodeURIComponent(commerceChatApiUrl)}` +
    `&v=4`
  );
}
