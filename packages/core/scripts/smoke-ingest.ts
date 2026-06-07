import { loadConfig } from "../src/config";
import { crawlWebsite } from "../src/ingest/crawler/website";
import { chunkWebsiteSections, countTokens, toVectorChunks } from "../src/ingest/chunker/website";
import { createEmbeddingProvider } from "../src/ingest/embedding";
import { createVectorStore } from "../src/ingest/vectors";
import { extractPageTitle, extractSections } from "../src/ingest/parsers/html";

async function main() {
  const config = loadConfig();
  const { pages, errors } = await crawlWebsite({
    startUrl: "https://example.com",
    maxDepth: 1,
    maxPages: 2,
  });
  console.log("pages:", pages.length, "errors:", errors);

  const crawledAt = new Date().toISOString();
  const drafts = [];
  for (const page of pages) {
    const title = extractPageTitle(page.html, page.url);
    const sections = extractSections(page.html, title);
    drafts.push(...chunkWebsiteSections("src_test", page.url, title, sections, crawledAt));
  }
  console.log("chunks:", drafts.length, "tokens:", countTokens(drafts.map((d) => d.text)));

  const embedder = createEmbeddingProvider(config);
  const embeddings = await embedder.embed(drafts.map((d) => d.text));
  const vectors = toVectorChunks("src_test", drafts, embeddings);

  const store = createVectorStore(config);
  await store.upsert("ten_smoke", vectors);
  const hits = await store.query("ten_smoke", embeddings[0]!, { topK: 3 });
  console.log("query hits:", hits.length, hits[0]?.score);
  console.log("OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
