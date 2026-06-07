"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { OnboardingStep } from "@commercechat/mock-api";

const STEPS: { key: OnboardingStep; label: string; path: string }[] = [
  { key: "profile", label: "Profile", path: "/onboarding/profile" },
  { key: "channels", label: "Channels", path: "/onboarding/channels" },
  { key: "knowledge", label: "Website", path: "/onboarding/knowledge" },
  { key: "catalog", label: "Catalog", path: "/onboarding/catalog" },
  { key: "test", label: "Test", path: "/onboarding/test" },
  { key: "widget", label: "Widget", path: "/onboarding/widget" },
];

export function OnboardingShell({
  currentStep,
  children,
}: {
  currentStep: OnboardingStep;
  children: React.ReactNode;
}) {
  const currentIdx = STEPS.findIndex((s) => s.key === currentStep);

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-white">CC</div>
            <span className="font-semibold">CommerceChat Setup</span>
          </div>
          <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
            Skip to dashboard
          </Link>
        </div>
        <div className="mx-auto flex max-w-3xl gap-2 px-6 pb-4 overflow-x-auto">
          {STEPS.map((step, idx) => (
            <div key={step.key} className="flex items-center gap-2 shrink-0">
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
              {idx < STEPS.length - 1 && <div className="mx-1 h-px w-6 bg-border" />}
            </div>
          ))}
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-6 py-8">{children}</div>
    </div>
  );
}
