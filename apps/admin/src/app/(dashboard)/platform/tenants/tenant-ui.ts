import type { PlatformTenantSummary } from "@commercechat/mock-api";

export const STATUS_OPTIONS = ["trial", "active", "suspended", "cancelled"] as const;
export const PLAN_OPTIONS = ["trial", "starter", "pro", "business", "enterprise"] as const;

export function moneyMinor(value: number | undefined, currency = "LKR") {
  return `${currency} ${((value ?? 0) / 100).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`;
}

export function shortDate(value: string | undefined) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(
    new Date(value)
  );
}

export function statusVariant(status: string) {
  if (status === "active" || status === "trial") return "success";
  if (status === "suspended" || status === "cancelled") return "warning";
  return "secondary";
}

export function usagePct(tenant: PlatformTenantSummary) {
  const max = tenant.usage.maxMessages || 1;
  return Math.min(100, Math.round((tenant.usage.messages / max) * 100));
}
