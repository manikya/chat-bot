/** Static export serves /conversations/_/ — real id lives in the browser URL or query string. */
export function conversationIdFromPath(pathname: string): string | null {
  const match = pathname.match(/\/conversations\/([^/]+)\/?$/);
  const id = match?.[1];
  if (!id || id === "_") return null;
  return decodeURIComponent(id);
}

export function conversationIdFromSearchParams(params: URLSearchParams): string | null {
  const id = params.get("id")?.trim();
  return id ? decodeURIComponent(id) : null;
}

export function conversationThreadHref(id: string): string {
  return `/conversations/_/?id=${encodeURIComponent(id)}`;
}
