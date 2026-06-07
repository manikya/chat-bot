import type { CrawledPage } from "../types";
import { isUrlAllowed, USER_AGENT } from "./robots";

export interface CrawlOptions {
  startUrl: string;
  maxDepth: number;
  maxPages: number;
  onPage?: (page: CrawledPage, index: number) => void | Promise<void>;
}

function normalizeUrl(base: string, href: string): string | null {
  try {
    const url = new URL(href, base);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    return url.toString().replace(/\/$/, "") || url.toString();
  } catch {
    return null;
  }
}

function sameHost(a: string, b: string): boolean {
  try {
    return new URL(a).host === new URL(b).host;
  } catch {
    return false;
  }
}

function extractLinks(html: string, baseUrl: string): string[] {
  const links = new Set<string>();
  const re = /href=["']([^"'#]+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const normalized = normalizeUrl(baseUrl, match[1]!);
    if (normalized && sameHost(baseUrl, normalized)) {
      links.add(normalized);
    }
  }
  return [...links];
}

export async function crawlWebsite(options: CrawlOptions): Promise<{
  pages: CrawledPage[];
  errors: string[];
}> {
  const { startUrl, maxDepth, maxPages, onPage } = options;
  const start = normalizeUrl(startUrl, startUrl);
  if (!start) {
    return { pages: [], errors: [`Invalid start URL: ${startUrl}`] };
  }

  const visited = new Set<string>();
  const queue: Array<{ url: string; depth: number }> = [{ url: start, depth: 0 }];
  const pages: CrawledPage[] = [];
  const errors: string[] = [];

  while (queue.length > 0 && pages.length < maxPages) {
    const { url, depth } = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);

    if (!(await isUrlAllowed(url))) {
      errors.push(`${url}: blocked by robots.txt`);
      continue;
    }

    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
        signal: AbortSignal.timeout(15000),
        redirect: "follow",
      });
      if (!res.ok) {
        errors.push(`${url}: HTTP ${res.status}`);
        continue;
      }
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
        continue;
      }
      const html = await res.text();
      const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
      const page: CrawledPage = {
        url,
        title: titleMatch?.[1]?.trim() || url,
        html,
      };
      pages.push(page);
      await onPage?.(page, pages.length);

      if (depth < maxDepth) {
        for (const link of extractLinks(html, url)) {
          if (!visited.has(link)) {
            queue.push({ url: link, depth: depth + 1 });
          }
        }
      }
    } catch (err) {
      errors.push(`${url}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { pages, errors };
}
