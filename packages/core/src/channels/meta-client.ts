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

type GranularScope = { scope: string; target_ids?: string[] };

export function discoverWabaIdFromDebug(debug: {
  granular_scopes?: GranularScope[];
}): string | undefined {
  for (const scopeName of ["whatsapp_business_management", "whatsapp_business_messaging"]) {
    const scope = debug.granular_scopes?.find((s) => s.scope === scopeName);
    const id = scope?.target_ids?.[0];
    if (id) return id;
  }
  return undefined;
}

export async function listUserBusinesses(config: CoreConfig, accessToken: string) {
  const res = await graphGet<{ data: Array<{ id: string; name?: string }> }>(
    config,
    "/me/businesses?fields=id,name",
    accessToken
  );
  return res.data ?? [];
}

async function listBusinessWabas(
  config: CoreConfig,
  businessId: string,
  accessToken: string,
  edge: "owned_whatsapp_business_accounts" | "client_whatsapp_business_accounts"
) {
  const res = await graphGet<{ data: Array<{ id: string; name?: string }> }>(
    config,
    `/${businessId}/${edge}?fields=id,name`,
    accessToken
  );
  return res.data ?? [];
}

async function discoverWabaFromMeBusinesses(
  config: CoreConfig,
  accessToken: string
): Promise<string | undefined> {
  try {
    const res = await graphGet<{
      businesses?: {
        data?: Array<{
          owned_whatsapp_business_accounts?: { data?: Array<{ id: string }> };
          client_whatsapp_business_accounts?: { data?: Array<{ id: string }> };
        }>;
      };
    }>(
      config,
      "/me?fields=businesses{owned_whatsapp_business_accounts.limit(5){id},client_whatsapp_business_accounts.limit(5){id}}",
      accessToken
    );
    for (const biz of res.businesses?.data ?? []) {
      const owned = biz.owned_whatsapp_business_accounts?.data?.[0]?.id;
      if (owned) return owned;
      const client = biz.client_whatsapp_business_accounts?.data?.[0]?.id;
      if (client) return client;
    }
  } catch {
    // try per-business edges next
  }
  return undefined;
}

/** Resolve WABA from debug_token target_ids or by querying the user's businesses. */
export async function discoverWabaFromAccessToken(
  config: CoreConfig,
  accessToken: string,
  debug?: { granular_scopes?: GranularScope[] }
): Promise<string | undefined> {
  const fromDebug = discoverWabaIdFromDebug(debug ?? {});
  if (fromDebug) return fromDebug;

  const fromMe = await discoverWabaFromMeBusinesses(config, accessToken);
  if (fromMe) return fromMe;

  const businessIds = new Set<string>();
  for (const s of debug?.granular_scopes ?? []) {
    if (s.scope === "business_management") {
      for (const id of s.target_ids ?? []) businessIds.add(id);
    }
  }

  if (businessIds.size === 0) {
    try {
      for (const b of await listUserBusinesses(config, accessToken)) {
        businessIds.add(b.id);
      }
    } catch {
      // fall through — caller reports a clear error if nothing is found
    }
  }

  for (const businessId of businessIds) {
    for (const edge of [
      "owned_whatsapp_business_accounts",
      "client_whatsapp_business_accounts",
    ] as const) {
      try {
        const wabas = await listBusinessWabas(config, businessId, accessToken, edge);
        if (wabas[0]?.id) return wabas[0].id;
      } catch {
        // try next edge / business
      }
    }
  }

  return undefined;
}

export function expiresAtFromSeconds(seconds?: number): string | undefined {
  if (!seconds) return undefined;
  return new Date(Date.now() + seconds * 1000).toISOString();
}
