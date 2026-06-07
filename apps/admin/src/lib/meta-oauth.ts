const META_OAUTH_STATE_KEY = "meta_oauth_state";
const META_OAUTH_RETURN_KEY = "meta_oauth_return";

export function getMetaOAuthRedirectUri(): string {
  if (typeof window === "undefined") return "";
  return (
    process.env.NEXT_PUBLIC_META_OAUTH_REDIRECT_URI ??
    `${window.location.origin}/channels/meta/callback`
  );
}

export function startMetaOAuth(returnPath?: string) {
  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  if (!appId) {
    throw new Error("NEXT_PUBLIC_META_APP_ID is not configured");
  }

  const redirectUri = getMetaOAuthRedirectUri();
  const state = crypto.randomUUID();
  sessionStorage.setItem(META_OAUTH_STATE_KEY, state);
  sessionStorage.setItem(META_OAUTH_RETURN_KEY, returnPath ?? window.location.pathname);

  const scope = [
    "whatsapp_business_management",
    "whatsapp_business_messaging",
    "business_management",
  ].join(",");

  const version = process.env.NEXT_PUBLIC_META_GRAPH_VERSION ?? "v21.0";
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    scope,
    response_type: "code",
  });

  window.location.href = `https://www.facebook.com/${version}/dialog/oauth?${params}`;
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
