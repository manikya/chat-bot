import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function PageHeaderSkeleton({ withAction = false }: { withAction?: boolean }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-9 w-[min(520px,80vw)]" />
        <Skeleton className="h-4 w-[min(620px,82vw)]" />
      </div>
      {withAction && <Skeleton className="h-10 w-36 rounded-full" />}
    </div>
  );
}

export function CardGridSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: cards }).map((_, idx) => (
        <Card key={idx} className="min-h-[118px]">
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-4 w-28" />
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-24" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function AdminPageSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton withAction />
      <CardGridSkeleton cards={cards} />
      <div className="grid gap-4 lg:grid-cols-2">
        <PanelSkeleton />
        <PanelSkeleton rows={4} />
      </div>
    </div>
  );
}

export function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Card>
      <CardHeader className="space-y-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-64" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: rows }).map((_, idx) => (
          <Skeleton key={idx} className="h-10 w-full rounded-lg" />
        ))}
      </CardContent>
    </Card>
  );
}

export function SplitPageSkeleton() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton withAction />
      <div className="grid gap-4 lg:grid-cols-2">
        <PanelSkeleton rows={5} />
        <PanelSkeleton rows={5} />
      </div>
    </div>
  );
}
