"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { PlanLimits, Usage } from "@commercechat/mock-api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export default function UsagePage() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [limits, setLimits] = useState<PlanLimits | null>(null);

  useEffect(() => {
    api.tenant.getLimits().then((r) => setLimits(r.data ?? null));
    api.tenant.getUsage().then((r) => setUsage(r.data ?? null));
  }, []);

  if (!limits) return <div>Loading...</div>;

  const pct = usage ? Math.round((usage.messages / limits.maxMessages) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Usage</h1>
        <p className="text-muted-foreground">Plan limits and usage from live DynamoDB metering</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Plan limits</CardTitle>
          <Badge variant="success">Live API</Badge>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <p>Max messages: {limits.maxMessages}</p>
          <p>Max sources: {limits.maxSources}</p>
          <p>Max team members: {limits.maxTeamMembers}</p>
        </CardContent>
      </Card>

      {usage && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Messages — {usage.period}</CardTitle>
            <Badge variant="success">Live API</Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>{usage.messages} / {limits.maxMessages}</span>
              <span>{usage.limits.messagesRemaining} remaining</span>
            </div>
            <Progress value={pct} />
          </CardContent>
        </Card>
      )}

      {usage && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader><CardTitle className="text-sm text-muted-foreground">Input tokens</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{usage.inputTokens.toLocaleString()}</p></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm text-muted-foreground">Output tokens</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{usage.outputTokens.toLocaleString()}</p></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-sm text-muted-foreground">Est. LLM cost</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">${usage.estimatedLlmCostUsd.toFixed(2)}</p></CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
