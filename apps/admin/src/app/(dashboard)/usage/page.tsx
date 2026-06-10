"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import type { BillingOverview } from "@commercechat/mock-api";
import { UsageMeters } from "@/components/billing/usage-meters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function UsagePage() {
  const [overview, setOverview] = useState<BillingOverview | null>(null);

  useEffect(() => {
    api.billing.getOverview().then((r) => setOverview(r.data ?? null));
  }, []);

  if (!overview) return <div className="text-muted-foreground">Loading usage...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Usage</h1>
          <p className="text-muted-foreground">
            Plan limits and live metering from DynamoDB
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/billing">
            Manage plan <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base capitalize">
            {overview.subscription.plan} plan
          </CardTitle>
          <Badge variant="success">Live API</Badge>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <p>Max messages: {overview.limits.maxMessages.toLocaleString()}</p>
          <p>Max sources: {overview.limits.maxSources.toLocaleString()}</p>
          <p>Max vectors: {overview.limits.maxVectors.toLocaleString()}</p>
          <p>Max team: {overview.limits.maxTeamMembers}</p>
        </CardContent>
      </Card>

      <UsageMeters overview={overview} />
    </div>
  );
}
