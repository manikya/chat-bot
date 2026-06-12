/** True on deployed AWS admin builds — encourage connecting a Meta channel. */
export function requireChannelsInOnboarding(): boolean {
  if (process.env.NEXT_PUBLIC_REQUIRE_CHANNELS === "1") return true;
  const api = process.env.NEXT_PUBLIC_API_URL ?? "";
  return api.includes("execute-api.") && api.includes("amazonaws.com");
}

export function apiPublicBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
}
