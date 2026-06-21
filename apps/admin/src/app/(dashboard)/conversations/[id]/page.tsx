import { Suspense } from "react";
import ConversationThreadPage from "./conversation-thread";
import { SplitPageSkeleton } from "@/components/layout/page-skeleton";

/** Placeholder path for static export; CloudFront rewrites /conversations/* here. */
export function generateStaticParams() {
  return [{ id: "_" }];
}

export default function Page() {
  return (
    <Suspense fallback={<SplitPageSkeleton />}>
      <ConversationThreadPage />
    </Suspense>
  );
}
