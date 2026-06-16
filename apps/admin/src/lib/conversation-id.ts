/** Static export serves /conversations/_/ — real id lives in the browser URL (CloudFront rewrite). */
export function conversationIdFromPath(pathname: string): string | null {
  const match = pathname.match(/\/conversations\/([^/]+)\/?$/);
  const id = match?.[1];
  if (!id || id === "_") return null;
  return decodeURIComponent(id);
}
