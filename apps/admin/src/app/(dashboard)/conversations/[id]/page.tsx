import { Suspense } from "react";
import ConversationThreadPage from "./conversation-thread";

/** Placeholder path for static export; CloudFront rewrites /conversations/* here. */
export function generateStaticParams() {
  return [{ id: "_" }];
}

export default function Page() {
  return (
    <Suspense fallback={<div className="text-muted-foreground">Loading...</div>}>
      <ConversationThreadPage />
    </Suspense>
  );
}
