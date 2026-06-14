import type { CoreConfig } from "../config";
import {
  runCatalogIngestJob,
  runConversationIngestJob,
  runFaqIngestJob,
  runWebsiteIngestJob,
  runWordPressCatalogIngestJob,
} from "./orchestrator";

export type IngestJobKind =
  | "website"
  | "catalog"
  | "woocommerce"
  | "faq"
  | "conversation";

export async function runIngestJobByKind(
  kind: IngestJobKind,
  tenantId: string,
  jobId: string,
  config: CoreConfig
): Promise<void> {
  switch (kind) {
    case "website":
      await runWebsiteIngestJob(tenantId, jobId, config);
      return;
    case "catalog":
      await runCatalogIngestJob(tenantId, jobId, config);
      return;
    case "woocommerce":
      await runWordPressCatalogIngestJob(tenantId, jobId, config);
      return;
    case "faq":
      await runFaqIngestJob(tenantId, jobId, config);
      return;
    case "conversation":
      await runConversationIngestJob(tenantId, jobId, config);
      return;
    default:
      throw new Error(`Unknown ingest job kind: ${kind}`);
  }
}
