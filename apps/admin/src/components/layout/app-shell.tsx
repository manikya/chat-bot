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
  Radio,
  Settings,
  Users,
  BarChart3,
  CreditCard,
  Code2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/analytics", label: "Analytics", icon: LineChart },
  { href: "/conversations", label: "Conversations", icon: MessageSquare },
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

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, tenant, logout } = useAuth();

  const showOnboardingBanner =
    user?.role === "owner" &&
    tenant?.onboardingStep &&
    tenant.onboardingStep !== "complete";

  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className="hidden w-64 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            CC
          </div>
          <div>
            <p className="text-sm font-semibold text-sidebar-foreground">CommerceChat</p>
            <p className="text-xs text-muted-foreground truncate max-w-[140px]">{tenant?.storeName}</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-muted"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b bg-background px-6">
          <div>
            {showOnboardingBanner && (
              <button
                onClick={() =>
                  router.push(
                    tenant?.onboardingStep && tenant.onboardingStep !== "complete"
                      ? `/onboarding/${tenant.onboardingStep}`
                      : "/onboarding/profile"
                  )
                }
                className="text-sm text-primary hover:underline"
              >
                Finish setup → {tenant?.onboardingStep}
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="secondary">{tenant?.plan ?? "trial"}</Badge>
            <span className="text-sm text-muted-foreground">{user?.name}</span>
            <Button variant="ghost" size="icon" onClick={() => logout().then(() => router.push("/login"))}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
