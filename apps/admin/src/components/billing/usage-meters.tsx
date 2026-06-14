"use client";

import type { BillingOverview } from "@commercechat/mock-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

function Meter({
  label,
  used,
  max,
  pct,
  unit = "",
  showRemaining = true,
}: {
  label: string;
  used: number;
  max: number;
  pct: number;
  unit?: string;
  showRemaining?: boolean;
}) {
  const remaining = Math.max(0, max - used);
  const warn = pct >= 80;
  const critical = pct >= 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className={critical ? "text-destructive" : warn ? "text-amber-600" : "text-muted-foreground"}>
          {used.toLocaleString()}
          {unit} / {max.toLocaleString()}
          {unit}
        </span>
      </div>
      <Progress value={pct} className={critical ? "[&>div]:bg-destructive" : warn ? "[&>div]:bg-amber-500" : undefined} />
      {showRemaining && (
        <p className="text-xs text-muted-foreground">{remaining.toLocaleString()} remaining this period</p>
      )}
    </div>
  );
}

export function UsageMeters({ overview }: { overview: BillingOverview }) {
  const { usage, limits, resources, utilization } = overview;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Usage — {usage.period}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <Meter
          label="Messages"
          used={usage.messages}
          max={limits.maxMessages}
          pct={utilization.messagesPct}
        />
        <Meter
          label="Knowledge sources"
          used={resources.sources}
          max={limits.maxSources}
          pct={utilization.sourcesPct}
        />
        <Meter
          label="Vectors (embeddings)"
          used={resources.vectors}
          max={limits.maxVectors}
          pct={utilization.vectorsPct}
        />
        <Meter
          label="Team members"
          used={resources.teamMembers}
          max={limits.maxTeamMembers}
          pct={utilization.teamPct}
        />
        <div className="grid gap-4 border-t pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Ingest jobs</p>
            <p className="text-lg font-semibold">{usage.ingestJobs.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">completed this period</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Input tokens</p>
            <p className="text-lg font-semibold">{usage.inputTokens.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Output tokens</p>
            <p className="text-lg font-semibold">{usage.outputTokens.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Est. LLM cost</p>
            <p className="text-lg font-semibold">${usage.estimatedLlmCostUsd.toFixed(2)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
