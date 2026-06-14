import type { IngestJob } from "@commercechat/mock-api";

export function ingestJobTypeLabel(type: string): string {
  switch (type) {
    case "woocommerce_sync":
      return "WooCommerce sync";
    case "catalog_sync":
      return "Catalog sync";
    case "website_sync":
      return "Website crawl";
    case "faq_sync":
      return "FAQ sync";
    case "conversation_sync":
      return "Page voice sync";
    default:
      return type.replace(/_/g, " ");
  }
}

export function formatIngestJobStats(job: IngestJob): string[] {
  const stats = job.stats;
  if (!stats) return [];

  const lines: string[] = [];

  const terminal = job.status === "completed" || job.status === "failed";

  if (stats.pagesProcessed != null && (stats.pagesProcessed > 0 || terminal)) {
    if (job.type === "woocommerce_sync" || job.type === "catalog_sync") {
      lines.push(`${stats.pagesProcessed} products`);
    } else if (job.type === "website_sync") {
      lines.push(`${stats.pagesProcessed} pages`);
    } else {
      lines.push(`${stats.pagesProcessed} items`);
    }
  }

  if (stats.chunksCreated != null && stats.chunksCreated > 0) {
    lines.push(`${stats.chunksCreated} chunks`);
  }

  if (stats.tokensEmbedded != null && stats.tokensEmbedded > 0) {
    lines.push(`${stats.tokensEmbedded.toLocaleString()} tokens`);
  }

  if (stats.durationSec != null && stats.durationSec > 0) {
    lines.push(`${stats.durationSec}s`);
  }

  return lines;
}
