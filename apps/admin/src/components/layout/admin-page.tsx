import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function PageIntro({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
      <div>
        <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.075em] text-primary">
          {eyebrow}
        </p>
        <h1 className="max-w-[760px] font-bold">{title}</h1>
        <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function IconFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-teal-200 bg-teal-100 text-primary",
        className
      )}
    >
      {children}
    </span>
  );
}

export function MetricTile({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <Card className="min-h-[118px]">
      <CardHeader className="flex flex-row items-center gap-3 pb-2">
        {icon && <IconFrame>{icon}</IconFrame>}
        <CardTitle className="font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="font-mono text-3xl font-semibold tracking-[-0.03em] tabular-nums">{value}</div>
        {detail && <p className="text-xs font-semibold text-primary">{detail}</p>}
      </CardContent>
    </Card>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div>
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.075em] text-primary">{eyebrow}</p>
      <h2 className="mt-1 text-lg font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>}
    </div>
  );
}
