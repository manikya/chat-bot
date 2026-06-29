"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import type { PlatformTenantDetail } from "@commercechat/mock-api";
import {
  AlertTriangle,
  ArrowLeft,
  CreditCard,
  MessageSquareText,
  RefreshCw,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { PageIntro, SectionHeader } from "@/components/layout/admin-page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { moneyMinor, PLAN_OPTIONS, shortDate, STATUS_OPTIONS, statusVariant } from "../tenant-ui";

function DetailItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(88px,0.42fr)_minmax(0,1fr)] items-start gap-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 overflow-hidden break-words text-right font-medium">{value}</dd>
    </div>
  );
}

export default function PlatformTenantDetailPage() {
  const params = useParams<{ tenantId: string }>();
  const pathname = usePathname();
  const routeTenantId = Array.isArray(params.tenantId) ? params.tenantId[0] : params.tenantId;
  const pathTenantId = pathname.match(/^\/platform\/tenants\/([^/?#]+)/)?.[1];
  const tenantId = decodeURIComponent(routeTenantId === "_" && pathTenantId ? pathTenantId : routeTenantId);
  const [tenant, setTenant] = useState<PlatformTenantDetail | null>(null);
  const [topUpAmount, setTopUpAmount] = useState("5000");
  const [resumeAi, setResumeAi] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTopUpSaving, setIsTopUpSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.platform.getTenant(tenantId);
      setTenant(res.data);
    } catch (err) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: string }).message)
          : "Could not load tenant";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [tenantId]);

  const usagePercent = useMemo(() => {
    if (!tenant) return 0;
    const max = tenant.usage.maxMessages || 1;
    return Math.min(100, Math.round((tenant.usage.messages / max) * 100));
  }, [tenant]);

  const updateTenant = async (patch: { status?: string; plan?: string }) => {
    if (!tenant) return;
    setIsSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.platform.updateTenant(tenant.tenantId, patch);
      setTenant(res.data);
      setNotice("Tenant updated.");
    } catch (err) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: string }).message)
          : "Could not update tenant";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const topUpWallet = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!tenant) return;
    const amount = Number(topUpAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Top-up amount must be greater than zero.");
      return;
    }
    setIsTopUpSaving(true);
    setError(null);
    setNotice(null);
    try {
      await api.platform.topUpTenantAiWallet(tenant.tenantId, {
        amountMinor: Math.round(amount * 100),
        currency: tenant.aiWallet?.currency ?? "LKR",
        resumeAi,
      });
      const res = await api.platform.getTenant(tenant.tenantId);
      setTenant(res.data);
      setNotice(`AI wallet topped up by ${moneyMinor(Math.round(amount * 100), tenant.aiWallet?.currency ?? "LKR")}.`);
    } catch (err) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: string }).message)
          : "Could not top up AI wallet";
      setError(message);
    } finally {
      setIsTopUpSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow="Platform"
        title={tenant?.storeName ?? "Tenant details"}
        description={tenant ? `${tenant.ownerEmail} | ${tenant.tenantId}` : tenantId}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/platform/tenants">
                <ArrowLeft className="h-4 w-4" />
                Tenants
              </Link>
            </Button>
            <Button variant="outline" onClick={() => void load()} disabled={isLoading}>
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        }
      />

      {error ? (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="font-semibold">{error}</p>
        </div>
      ) : null}

      {notice ? (
        <div className="rounded-lg border border-teal-200 bg-teal-50 p-4 text-sm font-semibold text-teal-900">
          {notice}
        </div>
      ) : null}

      {isLoading && !tenant ? (
        <Card>
          <CardContent className="flex h-40 items-center justify-center text-muted-foreground">
            Loading tenant...
          </CardContent>
        </Card>
      ) : tenant ? (
        <>
          <Card>
            <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-lg">{tenant.storeName}</CardTitle>
                  <Badge variant={statusVariant(tenant.status)}>{tenant.status}</Badge>
                  <Badge variant="secondary">{tenant.plan}</Badge>
                </div>
                <CardDescription className="mt-1">
                  {tenant.websiteUrl || "No website URL"} | {tenant.timezone ?? "No timezone"}
                </CardDescription>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Select
                  value={tenant.status}
                  disabled={isSaving}
                  onValueChange={(value) => void updateTenant({ status: value })}
                >
                  <SelectTrigger className="min-w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((item) => (
                      <SelectItem key={item} value={item}>{item}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={tenant.plan}
                  disabled={isSaving}
                  onValueChange={(value) => void updateTenant({ plan: value })}
                >
                  <SelectTrigger className="min-w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLAN_OPTIONS.map((item) => (
                      <SelectItem key={item} value={item}>{item}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-4">
              <div className="rounded-lg border border-border p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Account
                </div>
                <dl className="mt-3 space-y-2">
                  <DetailItem label="Onboarding" value={tenant.onboardingStep ?? "unknown"} />
                  <DetailItem label="Owner" value={tenant.ownerEmail} />
                  <DetailItem label="Created" value={shortDate(tenant.createdAt)} />
                  <DetailItem label="Updated" value={shortDate(tenant.updatedAt)} />
                </dl>
              </div>
              <div className="rounded-lg border border-border p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <CreditCard className="h-4 w-4 text-primary" />
                  Billing
                </div>
                <dl className="mt-3 space-y-2">
                  <DetailItem label="Plan" value={tenant.plan} />
                  <DetailItem label="Period end" value={shortDate(tenant.billingPeriodEnd)} />
                  <DetailItem label="Trial end" value={shortDate(tenant.trialEndsAt)} />
                  <DetailItem label="Cancels" value={tenant.cancelAtPeriodEnd ? "Yes" : "No"} />
                </dl>
              </div>
              <div className="rounded-lg border border-border p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <MessageSquareText className="h-4 w-4 text-primary" />
                  Usage
                </div>
                <dl className="mt-3 space-y-2">
                  <DetailItem label="Period" value={tenant.usage.period} />
                  <DetailItem label="Messages" value={`${tenant.usage.messages.toLocaleString()} / ${tenant.usage.maxMessages.toLocaleString()}`} />
                  <DetailItem label="Input tokens" value={tenant.usage.inputTokens.toLocaleString()} />
                  <DetailItem label="Output tokens" value={tenant.usage.outputTokens.toLocaleString()} />
                  <DetailItem label="Ingest jobs" value={tenant.usage.ingestJobs.toLocaleString()} />
                </dl>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${usagePercent}%` }} />
                </div>
              </div>
              <div className="rounded-lg border border-border p-4">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <WalletCards className="h-4 w-4 text-primary" />
                  AI wallet
                </div>
                <dl className="mt-3 space-y-2">
                  <DetailItem label="Balance" value={moneyMinor(tenant.aiWallet?.balanceMinor, tenant.aiWallet?.currency)} />
                  <DetailItem label="Status" value={tenant.aiWallet?.status ?? "inactive"} />
                  <DetailItem label="Prepaid" value={tenant.aiWallet?.prepaidAiEnabled ? "On" : "Off"} />
                  <DetailItem label="Low at" value={moneyMinor(tenant.aiWallet?.lowBalanceThresholdMinor, tenant.aiWallet?.currency)} />
                </dl>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
            <Card>
              <CardHeader>
                <SectionHeader
                  eyebrow="Configuration"
                  title="Tenant configuration"
                  description="A compact read-only view of platform-relevant settings."
                />
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-border p-4">
                  <h3 className="text-sm font-semibold">Channels</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {(tenant.config?.enabledChannels ?? []).join(", ") || "No channels configured"}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <h3 className="text-sm font-semibold">Commerce connector</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {tenant.config?.commerceConnector?.type ?? "unknown"} | {tenant.config?.commerceConnector?.status ?? "unknown"}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <h3 className="text-sm font-semibold">Limits</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {tenant.limits
                      ? `${tenant.limits.maxSources.toLocaleString()} sources, ${tenant.limits.maxVectors.toLocaleString()} vectors, ${tenant.limits.maxTeamMembers.toLocaleString()} team members`
                      : "Limits unavailable"}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <h3 className="text-sm font-semibold">Widget</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {tenant.config?.widgetConfig?.widgetEnabled === false ? "Disabled" : "Enabled"} | {tenant.config?.widgetConfig?.position ?? "default position"}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <SectionHeader
                  eyebrow="Wallet"
                  title="Top up AI wallet"
                  description="Adds prepaid AI credit to this tenant."
                />
              </CardHeader>
              <CardContent>
                <form onSubmit={topUpWallet} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="top-up-amount">Amount ({tenant.aiWallet?.currency ?? "LKR"})</Label>
                    <Input
                      id="top-up-amount"
                      inputMode="decimal"
                      value={topUpAmount}
                      onChange={(event) => setTopUpAmount(event.target.value)}
                      placeholder="5000"
                    />
                  </div>
                  <label className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm">
                    <input
                      type="checkbox"
                      checked={resumeAi}
                      onChange={(event) => setResumeAi(event.target.checked)}
                      className="mt-1"
                    />
                    <span>
                      <span className="block font-semibold">Resume AI replies after top-up</span>
                      <span className="mt-1 block text-muted-foreground">
                        Turns prepaid AI back on and leaves manual-only mode when the wallet has credit.
                      </span>
                    </span>
                  </label>
                  <Button type="submit" className="w-full" disabled={isTopUpSaving}>
                    {isTopUpSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <WalletCards className="h-4 w-4" />}
                    Top up wallet
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
