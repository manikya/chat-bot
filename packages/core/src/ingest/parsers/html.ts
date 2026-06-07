import * as cheerio from "cheerio";

export function extractPageTitle(html: string, fallbackUrl: string): string {
  const $ = cheerio.load(html);
  const title = $("title").first().text().trim() || $("h1").first().text().trim();
  return title || fallbackUrl;
}

export function extractMainText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, nav, footer, header, noscript, iframe").remove();
  const body = $("body").text() || $.root().text();
  return body.replace(/\s+/g, " ").trim();
}

export interface HtmlSection {
  title: string;
  text: string;
}

export function extractSections(html: string, pageTitle: string): HtmlSection[] {
  const $ = cheerio.load(html);
  $("script, style, nav, footer, header, noscript, iframe").remove();

  const headings = $("h2, h3").toArray();
  if (headings.length === 0) {
    const text = extractMainText(html);
    if (!text) return [];
    return [{ title: pageTitle, text }];
  }

  const sections: HtmlSection[] = [];
  for (let i = 0; i < headings.length; i++) {
    const $heading = $(headings[i]!);
    const title = $heading.text().trim() || pageTitle;
    const parts: string[] = [];
    const $stop = i + 1 < headings.length ? $(headings[i + 1]!) : null;
    let $node = $heading.next();
    while ($node.length > 0) {
      if ($stop?.length && $node[0] === $stop[0]) break;
      const tag = $node[0]?.type === "tag" ? $node[0].name.toLowerCase() : "";
      if (tag === "h2" || tag === "h3") break;
      const t = $node.text().replace(/\s+/g, " ").trim();
      if (t) parts.push(t);
      $node = $node.next();
    }
    const text = parts.join(" ").trim();
    if (text.length > 40) {
      sections.push({ title, text });
    }
  }
  return sections;
}
