"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Clock, CreditCard, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth/context";
import type { BillingOverview, BillingPlan, TenantPlan } from "@commercechat/mock-api";
import { UsageMeters } from "@/components/billing/usage-meters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AdminPageSkeleton } from "@/components/layout/page-skeleton";

const PLAN_ORDER: TenantPlan[] = ["starter", "pro", "business", "enterprise"];

function formatLkr(amount: number) {
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function planTier(plan: TenantPlan) {
  const order: TenantPlan[] = ["trial", "starter", "pro", "business", "enterprise"];
  return order.indexOf(plan);
}

function statusBadgeVariant(status: string): "success" | "warning" | "secondary" {
  if (status === "active") return "success";
  if (status === "trial") return "warning";
  if (status === "suspended") return "warning";
  return "secondary";
}

function statusLabel(status: string) {
  if (status === "suspended") return "Trial expired";
  return status;
}

export default function BillingPage() {
  const { user, tenant, refreshMe } = useAuth();
  const searchParams = useSearchParams();
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<TenantPlan | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isOwner = user?.role === "owner";
  const currentPlan = (overview?.subscription.plan ?? tenant?.plan ?? "trial") as TenantPlan;
  const subscription = overview?.subscription;
  const isTrial = subscription?.plan === "trial";
  const isSuspended = subscription?.status === "suspended";
  const canCancel =
    isOwner && subscription?.status === "active" && !subscription.cancelAtPeriodEnd && !isTrial;
  const canReactivate = isOwner && Boolean(subscription?.cancelAtPeriodEnd);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [overviewRes, plansRes] = await Promise.all([
        api.billing.getOverview(),
        api.billing.getPlans(),
      ]);
      setOverview(overviewRes.data ?? null);
      setPlans(plansRes.data?.plans ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const checkout = searchParams.get("checkout");
    if (checkout === "success") {
      setNotice("Payment completed — your plan should be active shortly.");
      refreshMe();
      load();
    } else if (checkout === "cancelled") {
      setNotice("Checkout was cancelled.");
    }
  }, [searchParams, refreshMe, load]);

  async function handleUpgrade(planId: TenantPlan) {
    if (!isOwner) return;
    setError(null);
    setNotice(null);
    setUpgrading(planId);
    try {
      const res = await api.billing.checkout({ plan: planId });
      const session = res.data;
      if (!session) throw new Error("No checkout session returned");

      if (session.redirectUrl) {
        window.location.href = session.redirectUrl;
        return;
      }
      if (session.status === "paid") {
        setNotice(session.message ?? "Plan upgraded successfully.");
        await refreshMe();
        await load();
        return;
      }
      setNotice(
        session.message ??
          `Checkout ${session.checkoutId} created. Complete payment via your gateway, then we will activate ${planId}.`
      );
    } catch (e) {
      const msg =
        typeof e === "object" && e && "message" in e
          ? String((e as { message: string }).message)
          : "Checkout failed";
      setError(msg);
    } finally {
      setUpgrading(null);
    }
  }

  async function handleCancel() {
    if (!canCancel) return;
    if (!confirm("Cancel at end of this billing period? You keep access until then.")) return;
    setError(null);
    setNotice(null);
    setCancelling(true);
    try {
      await api.billing.cancel();
      setNotice("Subscription will cancel at the end of the current billing period.");
      await load();
    } catch (e) {
      const msg =
        typeof e === "object" && e && "message" in e
          ? String((e as { message: string }).message)
          : "Cancellation failed";
      setError(msg);
    } finally {
      setCancelling(false);
    }
  }

  async function handleReactivate() {
    if (!canReactivate) return;
    setError(null);
    setNotice(null);
    setReactivating(true);
    try {
      await api.billing.reactivate();
      setNotice("Subscription reactivated — billing will continue as normal.");
      await load();
    } catch (e) {
      const msg =
        typeof e === "object" && e && "message" in e
          ? String((e as { message: string }).message)
          : "Reactivation failed";
      setError(msg);
    } finally {
      setReactivating(false);
    }
  }

  if (loading && !overview) {
    return <AdminPageSkeleton cards={3} />;
  }

  const paidPlans = plans.filter((p) => PLAN_ORDER.includes(p.id));
  const trialPlan = plans.find((p) => p.id === "trial");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Billing & plans</h1>
        <p className="text-muted-foreground">
          Manage your subscription and monitor usage. Payments use your Sri Lankan gateway — not Stripe.
        </p>
      </div>

      {notice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {isSuspended && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Your trial has ended. Upgrade to a paid plan to restore access.
        </div>
      )}

      {overview && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CreditCard className="h-5 w-5" />
                Current plan
              </CardTitle>
              <CardDescription className="mt-1 capitalize">
                {overview.planDetails?.name ?? overview.subscription.plan} ·{" "}
                {statusLabel(overview.subscription.status)}
              </CardDescription>
            </div>
            <Badge variant={statusBadgeVariant(overview.subscription.status)}>
              {statusLabel(overview.subscription.status)}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              {overview.subscription.currentPeriodEnd && (
                <p>
                  <span className="text-muted-foreground">
                    {isTrial ? "Trial ends" : overview.subscription.cancelAtPeriodEnd ? "Access until" : "Renews"}:
                  </span>{" "}
                  {new Date(overview.subscription.currentPeriodEnd).toLocaleDateString()}
                </p>
              )}
              {isTrial && subscription?.trialDaysRemaining != null && (
                <p className="flex items-center gap-1.5 text-amber-700">
                  <Clock className="h-4 w-4" />
                  {subscription.trialDaysRemaining} day
                  {subscription.trialDaysRemaining === 1 ? "" : "s"} remaining
                </p>
              )}
              {overview.subscription.cancelAtPeriodEnd && (
                <p className="text-amber-700 sm:col-span-2">
                  Cancels at end of billing period — reactivate below to keep your plan.
                </p>
              )}
              {!isOwner && (
                <p className="text-muted-foreground sm:col-span-2">
                  Only the account owner can change plans.
                </p>
              )}
            </div>

            {overview.planDetails && (
              <ul className="grid gap-1 border-t pt-4 text-sm sm:grid-cols-2">
                {overview.planDetails.features.slice(0, 6).map((f) => (
                  <li key={f} className="flex gap-2 text-muted-foreground">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            )}

            {isOwner && (canCancel || canReactivate) && (
              <div className="flex flex-wrap gap-2 border-t pt-4">
                {canCancel && (
                  <Button variant="outline" onClick={handleCancel} disabled={cancelling}>
                    {cancelling ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Cancelling…
                      </>
                    ) : (
                      "Cancel subscription"
                    )}
                  </Button>
                )}
                {canReactivate && (
                  <Button onClick={handleReactivate} disabled={reactivating}>
                    {reactivating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Reactivating…
                      </>
                    ) : (
                      "Reactivate subscription"
                    )}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {overview && <UsageMeters overview={overview} />}

      {isTrial && trialPlan && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader>
            <CardTitle className="text-base">Trial limits</CardTitle>
            <CardDescription>
              Full channel access during your {trialPlan.trialDays ?? 14}-day trial. Upgrade before it ends to
              keep messaging live.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm sm:grid-cols-2">
              {trialPlan.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="mb-4 text-lg font-semibold">Available plans</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {paidPlans.map((plan) => {
            const isCurrent = plan.id === currentPlan;
            const canUpgrade =
              isOwner && !isSuspended && planTier(plan.id) > planTier(currentPlan);
            const isEnterprise = plan.contactSales;

            return (
              <Card
                key={plan.id}
                className={cn(
                  "relative flex flex-col",
                  plan.highlighted && "border-primary shadow-md",
                  isCurrent && "ring-2 ring-primary"
                )}
              >
                {plan.highlighted && (
                  <Badge className="absolute -top-2.5 right-4" variant="default">
                    Popular
                  </Badge>
                )}
                <CardHeader>
                  <CardTitle>{plan.name}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                  <div className="pt-2">
                    {isEnterprise ? (
                      <p className="text-2xl font-bold">Custom</p>
                    ) : (
                      <>
                        <p className="text-2xl font-bold">{formatLkr(plan.priceLkr)}</p>
                        <p className="text-xs text-muted-foreground">
                          ~${plan.priceUsd}/mo · billed monthly
                        </p>
                      </>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col">
                  <ul className="mb-6 flex-1 space-y-2 text-sm">
                    {plan.features.map((f) => (
                      <li key={f} className="flex gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  {isCurrent ? (
                    <Button variant="secondary" disabled>
                      Current plan
                    </Button>
                  ) : isEnterprise ? (
                    <Button variant="outline" asChild>
                      <a href="mailto:sales@commercechat.com?subject=Enterprise%20plan">Contact sales</a>
                    </Button>
                  ) : canUpgrade ? (
                    <Button onClick={() => handleUpgrade(plan.id)} disabled={upgrading !== null}>
                      {upgrading === plan.id ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Processing…
                        </>
                      ) : isTrial || isSuspended ? (
                        `Choose ${plan.name}`
                      ) : (
                        `Upgrade to ${plan.name}`
                      )}
                    </Button>
                  ) : (
                    <Button variant="outline" disabled>
                      {isSuspended
                        ? "Upgrade from trial first"
                        : planTier(plan.id) <= planTier(currentPlan)
                          ? "Included or lower tier"
                          : "Unavailable"}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
