"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bot,
  BookOpen,
  Hash,
  LayoutDashboard,
  LineChart,
  LogOut,
  MessageSquare,
  PackageSearch,
  Radio,
  Settings,
  Users,
  BarChart3,
  CreditCard,
  Code2,
  ShieldCheck,
  Search,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/analytics", label: "Analytics", icon: LineChart },
  { href: "/content-ideas", label: "Content ideas", icon: Sparkles },
  { href: "/conversations", label: "Conversations", icon: MessageSquare },
  { href: "/products", label: "Products", icon: PackageSearch },
  { href: "/knowledge", label: "Knowledge", icon: BookOpen },
  { href: "/bot", label: "Bot config", icon: Bot },
  { href: "/channels", label: "Channels", icon: Radio },
  { href: "/widget", label: "Widget", icon: Code2 },
  { href: "/usage", label: "Usage", icon: BarChart3 },
  { href: "/billing", label: "Billing", icon: CreditCard },
  { href: "/settings/team", label: "Team", icon: Users },
  { href: "/settings/api-keys", label: "API keys", icon: Hash },
  { href: "/settings/profile", label: "Settings", icon: Settings },
];

function isPlatformAdminEmail(email: string | undefined, tenantId: string | undefined) {
  if (tenantId === "__platform__") return true;
  const configured = process.env.NEXT_PUBLIC_PLATFORM_ADMIN_EMAILS;
  if (!configured) return false;
  const allowed = configured
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return !!email && allowed.includes(email.toLowerCase());
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, tenant, logout } = useAuth();
  const visibleNav = isPlatformAdminEmail(user?.email, tenant?.tenantId)
    ? [
        { href: "/platform/tenants", label: "Platform tenants", icon: ShieldCheck },
        { href: "/platform/users", label: "Platform users", icon: Users },
        ...nav,
      ]
    : nav;

  const showOnboardingBanner =
    user?.role === "owner" &&
    tenant?.onboardingStep &&
    tenant.onboardingStep !== "complete";

  return (
    <div className="grid min-h-screen bg-transparent md:grid-cols-[264px_minmax(0,1fr)]">
      <aside className="hidden h-screen flex-col gap-[18px] bg-sidebar px-3.5 py-[18px] text-sidebar-foreground md:sticky md:top-0 md:flex">
        <div className="flex items-center gap-3 border-b border-sidebar-border px-1 pb-4">
          <span className="grid h-9 w-9 place-items-center rounded-[9px] bg-primary text-[13px] font-bold tracking-[-0.04em] text-primary-foreground shadow-none">
            CC
          </span>
          <div>
            <p className="text-sm font-semibold tracking-normal text-white">CommerceChat</p>
            <p className="max-w-[150px] truncate text-[11px] text-white/50">{tenant?.storeName ?? "Precision admin"}</p>
          </div>
        </div>

        <div>
          <p className="px-2 pb-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.075em] text-white/40">
            Operate
          </p>
          <nav className="grid gap-[3px]">
            {visibleNav.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex min-h-[38px] items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/[0.055] hover:text-white",
                    active && "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_3px_0_0_var(--primary)]"
                  )}
                >
                  <span
                    className={cn(
                      "grid h-7 w-7 place-items-center rounded-[7px] bg-white/[0.06] text-current",
                      active && "bg-teal-500/20 text-teal-200"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {showOnboardingBanner ? (
          <button
            onClick={() =>
              router.push(
                tenant?.onboardingStep && tenant.onboardingStep !== "complete"
                  ? `/onboarding/${tenant.onboardingStep}`
                  : "/onboarding/profile"
              )
            }
            className="mt-auto rounded-[10px] border border-white/[0.08] bg-white/[0.055] p-3 text-left transition-colors hover:bg-white/[0.08]"
          >
            <strong className="block text-[13px] font-semibold text-white">Setup progress</strong>
            <span className="mt-1 block text-xs text-white/60">Finish setup: {tenant?.onboardingStep}</span>
            <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-white/10">
              <span className="block h-full w-[72%] rounded-full bg-primary" />
            </span>
          </button>
        ) : (
          <div className="mt-auto rounded-[10px] border border-white/[0.08] bg-white/[0.055] p-3">
            <strong className="block text-[13px] font-semibold text-white">Setup progress</strong>
            <p className="mt-1 text-xs leading-relaxed text-white/60">
              Catalog, widget, channels, and agent settings are ready to monitor.
            </p>
            <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-white/10">
              <span className="block h-full w-full rounded-full bg-primary" />
            </span>
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex min-h-[60px] items-center justify-between gap-4 border-b border-border bg-white/85 px-6 backdrop-blur">
          <label className="hidden h-[38px] max-w-[540px] flex-1 items-center gap-2 rounded-lg border border-border bg-white px-3 text-muted-foreground sm:flex">
            <Search className="h-4 w-4" />
            <input
              className="h-full w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              placeholder="Find conversations, SKUs, sources, API keys"
              aria-label="Search admin"
            />
          </label>
          <div className="ml-auto flex items-center gap-2.5">
            <Badge variant="secondary">{tenant?.plan ?? "trial"} plan</Badge>
            <span className="hidden rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-muted-foreground sm:inline-flex">
              Owner: {user?.name ?? "Admin"}
            </span>
            <Button variant="outline" size="sm" asChild className="hidden md:inline-flex">
              <Link href="/settings/team">
                <UserPlus className="h-3.5 w-3.5" />
                Invite teammate
              </Link>
            </Button>
            <Button variant="ghost" size="icon" onClick={() => logout().then(() => router.push("/login"))}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1420px] flex-1 px-4 py-6 sm:px-6 lg:px-7">{children}</main>
      </div>
    </div>
  );
}
