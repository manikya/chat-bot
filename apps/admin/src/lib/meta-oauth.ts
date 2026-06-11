const META_OAUTH_STATE_KEY = "meta_oauth_state";
const META_OAUTH_RETURN_KEY = "meta_oauth_return";
const META_OAUTH_FLOW_KEY = "meta_oauth_flow";
const CALLBACK_PATH = "/channels/meta/callback";

export type MetaOAuthFlow = "whatsapp" | "messenger";

function callbackUriForOrigin(origin: string): string {
  return `${origin.replace(/\/$/, "")}${CALLBACK_PATH}`;
}

/** OAuth redirect URI sent to Meta — must match the page origin and Meta whitelist exactly. */
export function getMetaOAuthRedirectUri(): string {
  if (typeof window === "undefined") return "";

  const originUri = callbackUriForOrigin(window.location.origin);
  const configured = process.env.NEXT_PUBLIC_META_OAUTH_REDIRECT_URI?.trim();
  if (!configured) return originUri;

  try {
    if (new URL(configured).origin === window.location.origin) return configured;
  } catch {
    // ignore invalid configured URL
  }

  // e.g. env still says localhost but user opened admin via ngrok HTTPS
  return originUri;
}

export function assertOAuthRedirectAllowed(): void {
  const uri = getMetaOAuthRedirectUri();
  if (uri.startsWith("http://")) {
    throw new Error(
      "Meta OAuth requires HTTPS. Open the admin via your ngrok URL, then click Connect WhatsApp again."
    );
  }
}

function startMetaOAuthWithScopes(scopes: string[], flow: MetaOAuthFlow, returnPath?: string) {
  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  if (!appId) {
    throw new Error("NEXT_PUBLIC_META_APP_ID is not configured");
  }

  assertOAuthRedirectAllowed();
  const redirectUri = getMetaOAuthRedirectUri();
  const state = crypto.randomUUID();
  sessionStorage.setItem(META_OAUTH_STATE_KEY, state);
  sessionStorage.setItem(META_OAUTH_RETURN_KEY, returnPath ?? window.location.pathname);
  sessionStorage.setItem(META_OAUTH_FLOW_KEY, flow);

  const configId = process.env.NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID?.trim();

  const version = process.env.NEXT_PUBLIC_META_GRAPH_VERSION ?? "v21.0";
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    response_type: "code",
  });

  // Embedded Signup config_id opens Meta's asset picker (WABA selection).
  if (configId && flow === "whatsapp") {
    params.set("config_id", configId);
  } else {
    params.set("scope", scopes.join(","));
  }

  window.location.href = `https://www.facebook.com/${version}/dialog/oauth?${params}`;
}

export function startMetaOAuth(returnPath?: string) {
  startMetaOAuthWithScopes(
    ["whatsapp_business_management", "whatsapp_business_messaging", "business_management"],
    "whatsapp",
    returnPath
  );
}

export function startMetaMessengerOAuth(returnPath?: string) {
  startMetaOAuthWithScopes(
    ["pages_show_list", "pages_messaging", "pages_manage_metadata", "business_management"],
    "messenger",
    returnPath
  );
}

export function consumeMetaOAuthFlow(): MetaOAuthFlow {
  const flow = sessionStorage.getItem(META_OAUTH_FLOW_KEY) ?? "whatsapp";
  sessionStorage.removeItem(META_OAUTH_FLOW_KEY);
  return flow === "messenger" ? "messenger" : "whatsapp";
}

export function consumeMetaOAuthState(receivedState: string | null): string | null {
  const expected = sessionStorage.getItem(META_OAUTH_STATE_KEY);
  sessionStorage.removeItem(META_OAUTH_STATE_KEY);
  if (!expected || !receivedState || expected !== receivedState) return null;
  return sessionStorage.getItem(META_OAUTH_RETURN_KEY);
}

export function clearMetaOAuthReturn() {
  sessionStorage.removeItem(META_OAUTH_RETURN_KEY);
}
