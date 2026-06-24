import { Suspense } from "react";
import ProductDetailPage from "./product-detail";
import { SplitPageSkeleton } from "@/components/layout/page-skeleton";

/** Placeholder path for static export; CloudFront rewrites /products/* here. */
export function generateStaticParams() {
  return [{ sku: "_" }];
}

export default function Page() {
  return (
    <Suspense fallback={<SplitPageSkeleton />}>
      <ProductDetailPage />
    </Suspense>
  );
}

