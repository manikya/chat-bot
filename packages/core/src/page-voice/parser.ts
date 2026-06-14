import { ApiError, ErrorCodes } from "@commercechat/shared";

export interface ParsedConversationPair {
  customerText: string;
  ownerText: string;
}

function normalizeRole(role: string): "customer" | "owner" | "other" {
  const r = role.trim().toLowerCase();
  if (["customer", "user", "client", "buyer", "question"].includes(r)) return "customer";
  if (["owner", "assistant", "agent", "merchant", "answer", "page", "admin"].includes(r)) {
    return "owner";
  }
  return "other";
}

function pairsFromRoleContent(rows: Array<{ role: string; content: string }>): ParsedConversationPair[] {
  const pairs: ParsedConversationPair[] = [];
  let pendingCustomer: string | null = null;

  for (const row of rows) {
    const role = normalizeRole(row.role);
    const content = row.content?.trim() ?? "";
    if (!content) continue;

    if (role === "customer") {
      pendingCustomer = content;
      continue;
    }
    if (role === "owner" && pendingCustomer) {
      pairs.push({ customerText: pendingCustomer, ownerText: content });
      pendingCustomer = null;
    }
  }

  return pairs;
}

function pairsFromExplicit(items: Array<Record<string, string>>): ParsedConversationPair[] {
  const pairs: ParsedConversationPair[] = [];
  for (const item of items) {
    const customer =
      item.customer?.trim() ??
      item.customerText?.trim() ??
      item.question?.trim() ??
      item.user?.trim() ??
      "";
    const owner =
      item.owner?.trim() ??
      item.ownerText?.trim() ??
      item.answer?.trim() ??
      item.assistant?.trim() ??
      "";
    if (customer && owner) pairs.push({ customerText: customer, ownerText: owner });
  }
  return pairs;
}

function parseCsv(content: string): ParsedConversationPair[] {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const header = lines[0]!.split(",").map((h) => h.trim().toLowerCase());
  const customerIdx = header.findIndex((h) =>
    ["customer", "question", "user", "client"].includes(h)
  );
  const ownerIdx = header.findIndex((h) =>
    ["owner", "answer", "assistant", "agent", "merchant"].includes(h)
  );
  const roleIdx = header.indexOf("role");
  const contentIdx = header.findIndex((h) => ["content", "text", "message"].includes(h));

  if (customerIdx >= 0 && ownerIdx >= 0) {
    const pairs: ParsedConversationPair[] = [];
    for (const line of lines.slice(1)) {
      const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      const customer = cols[customerIdx] ?? "";
      const owner = cols[ownerIdx] ?? "";
      if (customer && owner) pairs.push({ customerText: customer, ownerText: owner });
    }
    return pairs;
  }

  if (roleIdx >= 0 && contentIdx >= 0) {
    const rows = lines.slice(1).map((line) => {
      const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      return { role: cols[roleIdx] ?? "", content: cols[contentIdx] ?? "" };
    });
    return pairsFromRoleContent(rows);
  }

  return [];
}

export function parseConversationFile(
  filename: string,
  content: string
): ParsedConversationPair[] {
  const lower = filename.toLowerCase();
  let pairs: ParsedConversationPair[] = [];

  if (lower.endsWith(".csv")) {
    pairs = parseCsv(content);
  } else if (lower.endsWith(".json")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Invalid JSON file", 400);
    }

    if (Array.isArray(parsed)) {
      if (parsed.length && typeof parsed[0] === "object" && parsed[0] !== null) {
        const first = parsed[0] as Record<string, unknown>;
        if ("role" in first && "content" in first) {
          pairs = pairsFromRoleContent(
            (parsed as Array<{ role: string; content: string }>).map((r) => ({
              role: String(r.role ?? ""),
              content: String(r.content ?? ""),
            }))
          );
        } else {
          pairs = pairsFromExplicit(parsed as Array<Record<string, string>>);
        }
      }
    } else if (parsed && typeof parsed === "object") {
      const obj = parsed as { messages?: Array<{ role: string; content: string }> };
      if (Array.isArray(obj.messages)) {
        pairs = pairsFromRoleContent(obj.messages);
      }
    }
  } else {
    throw new ApiError(
      ErrorCodes.VALIDATION_ERROR,
      "Supported formats: .json or .csv",
      400
    );
  }

  pairs = pairs.filter((p) => p.customerText.trim() && p.ownerText.trim());
  if (!pairs.length) {
    throw new ApiError(
      ErrorCodes.VALIDATION_ERROR,
      "No customer/owner pairs found in file",
      400
    );
  }
  if (pairs.length > 500) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Maximum 500 pairs per upload", 400);
  }

  return pairs;
}
