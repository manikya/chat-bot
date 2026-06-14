"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, CreditCard, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth/context";
import type { BillingCheckoutSession, BillingOverview, BillingPlan, TenantPlan } from "@commercechat/mock-api";
import { UsageMeters } from "@/components/billing/usage-meters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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
  return "secondary";
}

export default function BillingPage() {
  const { user, tenant, refreshMe } = useAuth();
  const searchParams = useSearchParams();
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<TenantPlan | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isOwner = user?.role === "owner";
  const currentPlan = (overview?.subscription.plan ?? tenant?.plan ?? "trial") as TenantPlan;

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

  if (loading && !overview) {
    return <div className="text-muted-foreground">Loading billing...</div>;
  }

  const paidPlans = plans.filter((p) => PLAN_ORDER.includes(p.id));

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

      {overview && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CreditCard className="h-5 w-5" />
                Current plan
              </CardTitle>
              <CardDescription className="mt-1 capitalize">
                {overview.subscription.plan} · {overview.subscription.status}
              </CardDescription>
            </div>
            <Badge variant={statusBadgeVariant(overview.subscription.status)}>
              {overview.subscription.status}
            </Badge>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
            {overview.subscription.currentPeriodEnd && (
              <p>
                <span className="text-muted-foreground">Renews / ends:</span>{" "}
                {new Date(overview.subscription.currentPeriodEnd).toLocaleDateString()}
              </p>
            )}
            {overview.subscription.cancelAtPeriodEnd && (
              <p className="text-amber-700">Cancels at end of billing period</p>
            )}
            {!isOwner && (
              <p className="text-muted-foreground sm:col-span-2">
                Only the account owner can change plans.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {overview && <UsageMeters overview={overview} />}

      <div>
        <h2 className="mb-4 text-lg font-semibold">Available plans</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {paidPlans.map((plan) => {
            const isCurrent = plan.id === currentPlan;
            const canUpgrade = isOwner && planTier(plan.id) > planTier(currentPlan);
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
                    <Button
                      onClick={() => handleUpgrade(plan.id)}
                      disabled={upgrading !== null}
                    >
                      {upgrading === plan.id ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Processing…
                        </>
                      ) : (
                        `Upgrade to ${plan.name}`
                      )}
                    </Button>
                  ) : (
                    <Button variant="outline" disabled>
                      {planTier(plan.id) <= planTier(currentPlan) ? "Included or lower tier" : "Unavailable"}
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
