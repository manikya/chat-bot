const USER_AGENT = "CommerceChatBot/1.0";

function parseDisallowRules(text: string): string[] {
  const lines = text.split(/\r?\n/);
  let inWildcard = false;
  const rules: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [directive, ...rest] = trimmed.split(":").map((s) => s.trim());
    const value = rest.join(":").trim();
    if (/^user-agent$/i.test(directive)) {
      inWildcard = value === "*";
      continue;
    }
    if (inWildcard && /^disallow$/i.test(directive) && value) {
      rules.push(value);
    }
  }
  return rules;
}

function pathMatchesRule(path: string, rule: string): boolean {
  if (rule === "/") return true;
  return path.startsWith(rule);
}

export async function isUrlAllowed(url: string): Promise<boolean> {
  try {
    const u = new URL(url);
    const res = await fetch(`${u.origin}/robots.txt`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return true;
    const text = await res.text();
    const rules = parseDisallowRules(text);
    return !rules.some((rule) => pathMatchesRule(u.pathname, rule));
  } catch {
    return true;
  }
}

export { USER_AGENT };
