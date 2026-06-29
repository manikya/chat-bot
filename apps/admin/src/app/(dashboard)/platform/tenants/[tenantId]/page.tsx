import { Suspense } from "react";
import { SplitPageSkeleton } from "@/components/layout/page-skeleton";
import PlatformTenantDetailPage from "./tenant-detail";

/** Placeholder path for static export; CloudFront rewrites /platform/tenants/* here. */
export function generateStaticParams() {
  return [{ tenantId: "_" }];
}

export default function Page() {
  return (
    <Suspense fallback={<SplitPageSkeleton />}>
      <PlatformTenantDetailPage />
    </Suspense>
  );
}
