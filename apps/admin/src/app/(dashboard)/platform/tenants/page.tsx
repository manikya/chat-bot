"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { PlatformTenantSummary } from "@commercechat/mock-api";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  CirclePause,
  MessageSquareText,
  RefreshCw,
  Search,
} from "lucide-react";
import { PageIntro, MetricTile, SectionHeader } from "@/components/layout/admin-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { moneyMinor, PLAN_OPTIONS, shortDate, STATUS_OPTIONS, statusVariant, usagePct } from "./tenant-ui";

export default function PlatformTenantsPage() {
  const router = useRouter();
  const [items, setItems] = useState<PlatformTenantSummary[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [plan, setPlan] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.platform.listTenants({
        q: q.trim() || undefined,
        status: status === "all" ? undefined : status,
        plan: plan === "all" ? undefined : plan,
        limit: 75,
      });
      setItems(res.data.items);
    } catch (err) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: string }).message)
          : "Could not load platform tenants";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 180);
    return () => window.clearTimeout(id);
  }, [q, status, plan]);

  const totals = useMemo(() => {
    const active = items.filter((item) => item.status === "active" || item.status === "trial").length;
    const suspended = items.filter((item) => item.status === "suspended" || item.status === "cancelled").length;
    const messages = items.reduce((sum, item) => sum + item.usage.messages, 0);
    const lowWallets = items.filter((item) => item.aiWallet?.status === "low" || item.aiWallet?.status === "empty").length;
    return { active, suspended, messages, lowWallets };
  }, [items]);

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow="Platform"
        title="Tenant operations"
        description="Search stores, review account health, and handle reversible account controls for platform support."
        action={
          <Button variant="outline" onClick={() => void load()} disabled={isLoading}>
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      {error ? (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">{error}</p>
            <p className="mt-1 text-amber-800">
              Set `PLATFORM_ADMIN_EMAILS` on the API to include your login email. Set
              `NEXT_PUBLIC_PLATFORM_ADMIN_EMAILS` on the UI if you want the sidebar link visible.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <MetricTile label="Loaded tenants" value={items.length} icon={<Building2 className="h-4 w-4" />} />
        <MetricTile label="Operational" value={totals.active} icon={<CheckCircle2 className="h-4 w-4" />} />
        <MetricTile label="Paused" value={totals.suspended} icon={<CirclePause className="h-4 w-4" />} />
        <MetricTile
          label="Messages this month"
          value={totals.messages.toLocaleString()}
          detail={totals.lowWallets ? `${totals.lowWallets} low AI wallets` : "Wallets healthy"}
          icon={<MessageSquareText className="h-4 w-4" />}
        />
      </div>

      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <SectionHeader
              eyebrow="Directory"
              title="Tenants"
              description="Filter by owner, store, plan, status, or tenant id."
            />
            <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_150px_150px] lg:min-w-[620px]">
              <label className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(event) => setQ(event.target.value)}
                  className="pl-9"
                  placeholder="Search tenants"
                />
              </label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {STATUS_OPTIONS.map((item) => (
                    <SelectItem key={item} value={item}>{item}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={plan} onValueChange={setPlan}>
                <SelectTrigger>
                  <SelectValue placeholder="Plan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All plans</SelectItem>
                  {PLAN_OPTIONS.map((item) => (
                    <SelectItem key={item} value={item}>{item}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Store</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Messages</TableHead>
                <TableHead>AI wallet</TableHead>
                <TableHead>Renewal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    Loading tenants...
                  </TableCell>
                </TableRow>
              ) : items.length ? (
                items.map((tenant) => (
                  <TableRow
                    key={tenant.tenantId}
                    className="cursor-pointer"
                    onClick={() => router.push(`/platform/tenants/${encodeURIComponent(tenant.tenantId)}`)}
                  >
                    <TableCell>
                      <div className="font-semibold">{tenant.storeName}</div>
                      <div className="mt-1 max-w-[280px] truncate text-xs text-muted-foreground">
                        {tenant.ownerEmail} | {tenant.tenantId}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{tenant.plan}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(tenant.status)}>{tenant.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="font-mono text-sm tabular-nums">
                        {tenant.usage.messages.toLocaleString()} / {tenant.usage.maxMessages.toLocaleString()}
                      </div>
                      <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-muted">
                        <span className="block h-full rounded-full bg-primary" style={{ width: `${usagePct(tenant)}%` }} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{moneyMinor(tenant.aiWallet?.balanceMinor, tenant.aiWallet?.currency)}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{tenant.aiWallet?.status ?? "inactive"}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-muted-foreground">
                        {shortDate(tenant.billingPeriodEnd ?? tenant.trialEndsAt)}
                      </div>
                      <Button variant="ghost" size="sm" className="mt-1 px-0 text-primary">
                        View details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    No tenants match these filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
