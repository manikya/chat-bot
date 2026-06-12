"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import type { OnboardingState, OnboardingStep } from "@commercechat/mock-api";
import { Progress } from "@/components/ui/progress";

const STEPS: { key: OnboardingStep; label: string; path: string }[] = [
  { key: "profile", label: "Profile", path: "/onboarding/profile" },
  { key: "channels", label: "Channels", path: "/onboarding/channels" },
  { key: "knowledge", label: "Website", path: "/onboarding/knowledge" },
  { key: "catalog", label: "Catalog", path: "/onboarding/catalog" },
  { key: "test", label: "Test", path: "/onboarding/test" },
  { key: "widget", label: "Widget", path: "/onboarding/widget" },
];

function stepProgress(currentStep: OnboardingStep, state: OnboardingState | null): number {
  if (currentStep === "complete") return 100;
  const completed = state?.steps.filter((s) => s.status === "completed").length ?? 0;
  const idx = STEPS.findIndex((s) => s.key === currentStep);
  const base = Math.max(completed, idx);
  return Math.round((base / STEPS.length) * 100);
}

export function OnboardingShell({
  currentStep,
  children,
}: {
  currentStep: OnboardingStep;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const currentIdx = STEPS.findIndex((s) => s.key === currentStep);
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);

  useEffect(() => {
    api.onboarding.getState().then((r) => setOnboarding(r.data)).catch(() => {});
  }, [currentStep]);

  const progress = stepProgress(currentStep, onboarding);
  const minutesLeft = onboarding?.estimatedMinutesRemaining;

  const canNavigateTo = (idx: number) => idx <= currentIdx;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-white">
              CC
            </div>
            <div>
              <span className="font-semibold">CommerceChat Setup</span>
              {minutesLeft != null && minutesLeft > 0 && (
                <p className="text-xs text-muted-foreground">~{minutesLeft} min remaining</p>
              )}
            </div>
          </div>
          <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
            Complete later
          </Link>
        </div>
        <div className="mx-auto max-w-3xl px-6 pb-2">
          <Progress value={progress} className="h-1.5" />
        </div>
        <div className="mx-auto flex max-w-3xl gap-2 px-6 pb-4 overflow-x-auto">
          {STEPS.map((step, idx) => {
            const navigable = canNavigateTo(idx);
            const content = (
              <>
                <div
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium",
                    idx < currentIdx && "bg-primary text-white",
                    idx === currentIdx && "bg-primary text-white ring-4 ring-primary/20",
                    idx > currentIdx && "bg-muted text-muted-foreground"
                  )}
                >
                  {idx + 1}
                </div>
                <span className={cn("text-sm", idx === currentIdx ? "font-medium" : "text-muted-foreground")}>
                  {step.label}
                </span>
              </>
            );
            return (
              <div key={step.key} className="flex items-center gap-2 shrink-0">
                {navigable ? (
                  <button
                    type="button"
                    onClick={() => router.push(step.path)}
                    className="flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-muted/80"
                  >
                    {content}
                  </button>
                ) : (
                  <div className="flex items-center gap-2 opacity-60">{content}</div>
                )}
                {idx < STEPS.length - 1 && <div className="mx-1 h-px w-6 bg-border" />}
              </div>
            );
          })}
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-6 py-8">{children}</div>
    </div>
  );
}
