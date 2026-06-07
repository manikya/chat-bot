import type { CoreConfig } from "../config";

export class MetaGraphError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly status = 400
  ) {
    super(message);
    this.name = "MetaGraphError";
  }
}

function graphBase(config: CoreConfig) {
  return `https://graph.facebook.com/${config.metaGraphVersion}`;
}

async function graphGet<T>(config: CoreConfig, path: string, accessToken: string): Promise<T> {
  const url = `${graphBase(config)}${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url);
  const json = (await res.json()) as T & { error?: { message: string; code?: number } };
  if (!res.ok || json.error) {
    throw new MetaGraphError(json.error?.message ?? res.statusText, json.error?.code, res.status);
  }
  return json;
}

async function graphPost<T>(
  config: CoreConfig,
  path: string,
  accessToken: string,
  body?: Record<string, string>
): Promise<T> {
  const params = new URLSearchParams(body ?? {});
  const res = await fetch(`${graphBase(config)}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: params.toString() ? params : undefined,
  });
  const json = (await res.json()) as T & { error?: { message: string; code?: number } };
  if (!res.ok || json.error) {
    throw new MetaGraphError(json.error?.message ?? res.statusText, json.error?.code, res.status);
  }
  return json;
}

export async function exchangeOAuthCode(
  config: CoreConfig,
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; expiresIn?: number }> {
  if (!config.metaAppId || !config.metaAppSecret) {
    throw new MetaGraphError("Meta app credentials not configured", undefined, 500);
  }
  const params = new URLSearchParams({
    client_id: config.metaAppId,
    client_secret: config.metaAppSecret,
    redirect_uri: redirectUri,
    code,
  });
  const res = await fetch(`${graphBase(config)}/oauth/access_token?${params}`);
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: { message: string; code?: number };
  };
  if (!res.ok || !json.access_token) {
    throw new MetaGraphError(json.error?.message ?? "OAuth token exchange failed", json.error?.code, res.status);
  }
  return { accessToken: json.access_token, expiresIn: json.expires_in };
}

export async function refreshLongLivedToken(
  config: CoreConfig,
  accessToken: string
): Promise<{ accessToken: string; expiresIn?: number }> {
  if (!config.metaAppId || !config.metaAppSecret) {
    throw new MetaGraphError("Meta app credentials not configured", undefined, 500);
  }
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: config.metaAppId,
    client_secret: config.metaAppSecret,
    fb_exchange_token: accessToken,
  });
  const res = await fetch(`${graphBase(config)}/oauth/access_token?${params}`);
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: { message: string; code?: number };
  };
  if (!res.ok || !json.access_token) {
    throw new MetaGraphError(json.error?.message ?? "Token refresh failed", json.error?.code, res.status);
  }
  return { accessToken: json.access_token, expiresIn: json.expires_in };
}

export async function debugAccessToken(config: CoreConfig, accessToken: string) {
  const appToken = `${config.metaAppId}|${config.metaAppSecret}`;
  const res = await fetch(
    `${graphBase(config)}/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(appToken)}`
  );
  const json = (await res.json()) as {
    data?: {
      is_valid: boolean;
      expires_at?: number;
      granular_scopes?: Array<{ scope: string; target_ids?: string[] }>;
    };
    error?: { message: string };
  };
  if (!res.ok || !json.data?.is_valid) {
    throw new MetaGraphError(json.error?.message ?? "Invalid access token");
  }
  return json.data;
}

export async function listWabaPhoneNumbers(
  config: CoreConfig,
  wabaId: string,
  accessToken: string
) {
  const res = await graphGet<{ data: Array<{ id: string; display_phone_number?: string; verified_name?: string; status?: string }> }>(
    config,
    `/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,status`,
    accessToken
  );
  return res.data ?? [];
}

export async function getPhoneNumberDetails(
  config: CoreConfig,
  phoneNumberId: string,
  accessToken: string
) {
  return graphGet<{
    id: string;
    display_phone_number?: string;
    verified_name?: string;
    status?: string;
  }>(config, `/${phoneNumberId}?fields=id,display_phone_number,verified_name,status`, accessToken);
}

export async function subscribeWabaToApp(
  config: CoreConfig,
  wabaId: string,
  accessToken: string
) {
  return graphPost<{ success: boolean }>(config, `/${wabaId}/subscribed_apps`, accessToken);
}

export async function sendWhatsAppText(
  config: CoreConfig,
  phoneNumberId: string,
  accessToken: string,
  to: string,
  text: string
) {
  const res = await fetch(`${graphBase(config)}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text.slice(0, 4096) },
    }),
  });
  const json = (await res.json()) as {
    messages?: Array<{ id: string }>;
    error?: { message: string; code?: number };
  };
  if (!res.ok || json.error) {
    throw new MetaGraphError(json.error?.message ?? "Send failed", json.error?.code, res.status);
  }
  return json;
}

export function discoverWabaIdFromDebug(debug: {
  granular_scopes?: Array<{ scope: string; target_ids?: string[] }>;
}): string | undefined {
  const scope = debug.granular_scopes?.find(
    (s) => s.scope === "whatsapp_business_management" || s.scope === "whatsapp_business_messaging"
  );
  return scope?.target_ids?.[0];
}

export function expiresAtFromSeconds(seconds?: number): string | undefined {
  if (!seconds) return undefined;
  return new Date(Date.now() + seconds * 1000).toISOString();
}
