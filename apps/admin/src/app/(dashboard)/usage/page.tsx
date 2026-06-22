"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Database, MessageSquare, Users, Zap } from "lucide-react";
import { api } from "@/lib/api";
import type { BillingOverview } from "@commercechat/mock-api";
import { UsageMeters } from "@/components/billing/usage-meters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminPageSkeleton } from "@/components/layout/page-skeleton";
import { MetricTile, PageIntro, SectionHeader } from "@/components/layout/admin-page";

export default function UsagePage() {
  const [overview, setOverview] = useState<BillingOverview | null>(null);

  useEffect(() => {
    api.billing.getOverview().then((r) => setOverview(r.data ?? null));
  }, []);

  if (!overview) return <AdminPageSkeleton cards={3} />;

  return (
    <div className="space-y-6">
      <PageIntro
        eyebrow="Quota operations"
        title="Track message volume, knowledge size, and team capacity before limits bite."
        description="Current plan usage, resource utilization, token spend, and enabled channel limits for this billing period."
        action={
          <Button variant="outline" asChild>
          <Link href="/billing">
            Manage plan <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Messages" value={overview.usage.messages.toLocaleString()} detail={`${overview.resources.messagesRemaining.toLocaleString()} remaining`} icon={<MessageSquare className="h-4 w-4" />} />
        <MetricTile label="Sources" value={overview.resources.sources.toLocaleString()} detail={`${overview.utilization.sourcesPct}% used`} icon={<Database className="h-4 w-4" />} />
        <MetricTile label="Vectors" value={overview.resources.vectors.toLocaleString()} detail={`${overview.utilization.vectorsPct}% used`} icon={<Zap className="h-4 w-4" />} />
        <MetricTile label="Team" value={overview.resources.teamMembers.toLocaleString()} detail={`${overview.limits.maxTeamMembers} max seats`} icon={<Users className="h-4 w-4" />} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <SectionHeader
            eyebrow="Plan envelope"
            title={`${overview.subscription.plan} plan`}
            description="Hard limits and enabled channels currently applied to this tenant."
          />
          <Badge variant={overview.subscription.status === "active" ? "success" : "warning"}>
            {overview.subscription.status}
          </Badge>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border bg-muted px-3 py-2">
            <p className="text-xs text-muted-foreground">Max messages</p>
            <p className="font-mono text-lg font-semibold">{overview.limits.maxMessages.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border bg-muted px-3 py-2">
            <p className="text-xs text-muted-foreground">Max sources</p>
            <p className="font-mono text-lg font-semibold">{overview.limits.maxSources.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border bg-muted px-3 py-2">
            <p className="text-xs text-muted-foreground">Max vectors</p>
            <p className="font-mono text-lg font-semibold">{overview.limits.maxVectors.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border bg-muted px-3 py-2">
            <p className="text-xs text-muted-foreground">Max team</p>
            <p className="font-mono text-lg font-semibold">{overview.limits.maxTeamMembers}</p>
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4">
            {overview.limits.enabledChannels.map((channel) => (
              <Badge key={channel} variant="secondary">{channel}</Badge>
            ))}
          </div>
          {overview.subscription.trialDaysRemaining != null && (
            <p className="text-amber-700 sm:col-span-2 lg:col-span-4">
              Trial: {overview.subscription.trialDaysRemaining} days left
            </p>
          )}
        </CardContent>
      </Card>

      <UsageMeters overview={overview} />
    </div>
  );
}
