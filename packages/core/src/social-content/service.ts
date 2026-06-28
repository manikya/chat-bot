import { GetCommand, PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import {
  ApiError,
  ErrorCodes,
  ok,
  type AuthContext,
  type DailySocialContent,
  type SocialContentIdea,
  type TenantProfile,
} from "@commercechat/shared";
import type { CoreConfig } from "../config";
import { listCatalogSearchHints, listProductItems } from "../catalog/products";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";
import { createLLMProvider } from "../llm/provider";
import { deletePushDevice, listTenantPushTokensForRoles } from "../devices/service";
import { sendExpoPushMessages, type ExpoPushTicket } from "../push/expo";

const CONTENT_IDEAS_ROUTE = "/(tabs)/home/content-ideas";
const MAX_PRODUCTS = 8;
const MAX_TERMS = 10;

interface DailySocialContentResult {
  scanned: number;
  generated: number;
  pushed: number;
  staleRemoved: number;
  failed: number;
}

type TenantRow = { tenantId: string; profile: TenantProfile & Record<string, unknown> };

function todayInTimezone(timezone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    // fall through to UTC
  }
  return new Date().toISOString().slice(0, 10);
}

function seasonForDate(date: string) {
  const month = Number(date.slice(5, 7));
  if ([12, 1, 2].includes(month)) return "holiday and new year season";
  if ([3, 4, 5].includes(month)) return "spring gifting and refresh season";
  if ([6, 7, 8].includes(month)) return "mid-year and summer shopping season";
  return "fall, festive, and year-end planning season";
}

function weekdayForDate(date: string, timezone: string) {
  try {
    return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: timezone }).format(
      new Date(`${date}T12:00:00Z`)
    );
  } catch {
    return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(new Date(`${date}T12:00:00Z`));
  }
}

async function listTenantProfiles(config: CoreConfig): Promise<TenantRow[]> {
  const db = getDocClient(config);
  const rows: TenantRow[] = [];
  let startKey: Record<string, unknown> | undefined;

  do {
    const res = await db.send(
      new ScanCommand({
        TableName: config.tableName,
        FilterExpression: "SK = :sk AND begins_with(PK, :pk)",
        ExpressionAttributeValues: {
          ":sk": Keys.profile(),
          ":pk": "TENANT#",
        },
        ExclusiveStartKey: startKey,
      })
    );
    for (const item of res.Items ?? []) {
      const pk = String(item.PK ?? "");
      if (!pk.startsWith("TENANT#")) continue;
      rows.push({ tenantId: pk.slice("TENANT#".length), profile: item as TenantRow["profile"] });
    }
    startKey = res.LastEvaluatedKey;
  } while (startKey);

  return rows;
}

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/[,;|]/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function unique(items: string[], limit: number) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const normalized = item.trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= limit) break;
  }
  return out;
}

async function collectSignals(tenantId: string, config: CoreConfig) {
  const [products, hints] = await Promise.all([
    listProductItems(tenantId, config),
    listCatalogSearchHints(tenantId, config).catch(() => null),
  ]);

  const productNames = products
    .filter((item) => item.inStock !== false)
    .slice(0, MAX_PRODUCTS)
    .map((item) => String(item.name ?? item.sku ?? "Product"));
  const categories = unique(
    [
      ...(hints?.categories ?? []),
      ...products.flatMap((item) => normalizeStringList(item.categories ?? item.category)),
    ],
    MAX_TERMS
  );
  const tags = unique(
    [
      ...(hints?.tags ?? []),
      ...products.flatMap((item) => normalizeStringList(item.tags)),
    ],
    MAX_TERMS
  );
  const starterIntents = unique(hints?.starterIntents ?? [], MAX_TERMS);

  return {
    products: unique(productNames, MAX_PRODUCTS),
    categories,
    tags,
    starterIntents,
  };
}

function deterministicIdeas(input: {
  storeName: string;
  date: string;
  timezone: string;
  signals: DailySocialContent["signals"];
}): SocialContentIdea[] {
  const weekday = weekdayForDate(input.date, input.timezone);
  const season = seasonForDate(input.date);
  const products = input.signals.products.length ? input.signals.products : ["best sellers"];
  const categories = input.signals.categories.length ? input.signals.categories : ["customer favorites"];
  const tags = input.signals.tags.length ? input.signals.tags : categories;
  return [
    {
      id: "idea_1",
      title: `${weekday} pick: ${products[0]}`,
      captionIdea: `Show why ${products[0]} is a timely choice for shoppers today, with a simple question sticker or comment prompt.`,
      productAngle: products[0]!,
      suggestedFormat: "story",
      hashtags: unique([tags[0] ?? "new", categories[0] ?? "shopping", "today"], 5).map((tag) => `#${tag.replace(/\s+/g, "")}`),
      whyToday: `Connect it to ${weekday} planning and ${season}.`,
    },
    {
      id: "idea_2",
      title: `Quick reel for ${categories[0]}`,
      captionIdea: `Create a 10-second reel showing 3 reasons customers choose ${categories[0]}, ending with a product close-up.`,
      productAngle: categories[0]!,
      suggestedFormat: "reel",
      hashtags: unique([categories[0] ?? "gift", tags[1] ?? "shoplocal", "reels"], 5).map((tag) => `#${tag.replace(/\s+/g, "")}`),
      whyToday: `Short-form product education works well for morning browsing.`,
    },
    {
      id: "idea_3",
      title: `Carousel: gift-ready ideas`,
      captionIdea: `Post a carousel featuring ${products.slice(0, 3).join(", ")} with one benefit per slide.`,
      productAngle: products.slice(0, 3).join(", "),
      suggestedFormat: "carousel",
      hashtags: unique(["giftideas", ...(tags.slice(0, 3))], 5).map((tag) => `#${tag.replace(/\s+/g, "")}`),
      whyToday: `Use the ${season} angle to make the products feel timely.`,
    },
  ];
}

function parseIdeasJson(content: string): SocialContentIdea[] | null {
  try {
    const parsed = JSON.parse(content) as { ideas?: SocialContentIdea[] };
    if (!Array.isArray(parsed.ideas)) return null;
    return parsed.ideas
      .map((idea, index) => ({
        id: idea.id || `idea_${index + 1}`,
        title: String(idea.title ?? "").trim(),
        captionIdea: String(idea.captionIdea ?? "").trim(),
        productAngle: String(idea.productAngle ?? "").trim(),
        suggestedFormat: String(idea.suggestedFormat ?? "post"),
        hashtags: Array.isArray(idea.hashtags) ? idea.hashtags.map(String).slice(0, 8) : [],
        whyToday: String(idea.whyToday ?? "").trim(),
      }))
      .filter((idea) => idea.title && idea.captionIdea)
      .slice(0, 5);
  } catch {
    return null;
  }
}

async function generateIdeas(input: {
  storeName: string;
  date: string;
  timezone: string;
  signals: DailySocialContent["signals"];
  config: CoreConfig;
}): Promise<{ source: DailySocialContent["source"]; ideas: SocialContentIdea[] }> {
  const provider = createLLMProvider(input.config);
  if (!provider) {
    return { source: "deterministic", ideas: deterministicIdeas(input) };
  }

  const weekday = weekdayForDate(input.date, input.timezone);
  const season = seasonForDate(input.date);
  try {
    const res = await provider.chat({
      model: input.config.plannerModel ?? input.config.llmModel,
      temperature: 0.5,
      maxOutputTokens: 900,
      responseFormat: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You generate concise, practical social media content ideas for small commerce stores. Return strict JSON with an ideas array only.",
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Generate 3 to 5 social content ideas for today.",
            storeName: input.storeName,
            date: input.date,
            weekday,
            season,
            timezone: input.timezone,
            products: input.signals.products,
            categories: input.signals.categories,
            tags: input.signals.tags,
            starterIntents: input.signals.starterIntents,
            requirements: {
              fields: ["title", "captionIdea", "productAngle", "suggestedFormat", "hashtags", "whyToday"],
              tone: "specific, useful, short",
              avoid: "generic marketing fluff",
            },
          }),
        },
      ],
    });
    const ideas = parseIdeasJson(res.content);
    if (ideas?.length) return { source: "ai", ideas };
  } catch (err) {
    console.warn("[social-content] AI generation failed", err instanceof Error ? err.message : err);
  }
  return { source: "deterministic", ideas: deterministicIdeas(input) };
}

function summaryForIdeas(ideas: SocialContentIdea[]) {
  const angles = unique(ideas.map((idea) => idea.productAngle).filter(Boolean), 3);
  if (!angles.length) return `${ideas.length} content ideas are ready for today.`;
  return `${ideas.length} ideas for today's posts: ${angles.join(", ")}.`;
}

async function saveDailyContent(content: DailySocialContent, config: CoreConfig) {
  const db = getDocClient(config);
  await db.send(
    new PutCommand({
      TableName: config.tableName,
      Item: {
        PK: Keys.tenantPk(content.tenantId),
        SK: Keys.socialContentDaily(content.date),
        ...content,
      },
    })
  );
}

export async function getDailySocialContent(auth: AuthContext, config: CoreConfig) {
  const profile = await getTenantProfile(auth.tenantId, config);
  const date = todayInTimezone(profile.timezone ?? "UTC");
  const latest = await getDailySocialContentForDate(auth.tenantId, date, config);
  return ok(latest);
}

async function getTenantProfile(tenantId: string, config: CoreConfig): Promise<TenantProfile> {
  const db = getDocClient(config);
  const res = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.profile() },
    })
  );
  if (!res.Item) throw new ApiError(ErrorCodes.NOT_FOUND, "Tenant not found", 404);
  return res.Item as TenantProfile;
}

async function getDailySocialContentForDate(
  tenantId: string,
  date: string,
  config: CoreConfig
): Promise<DailySocialContent | null> {
  const db = getDocClient(config);
  const res = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.socialContentDaily(date) },
    })
  );
  return (res.Item as DailySocialContent | undefined) ?? null;
}

export async function generateDailySocialContent(
  auth: AuthContext,
  config: CoreConfig,
  options?: { force?: boolean }
) {
  if (auth.role === "viewer") throw new ApiError(ErrorCodes.FORBIDDEN, "Insufficient permissions", 403);
  const profile = await getTenantProfile(auth.tenantId, config);
  const content = await generateDailySocialContentForTenant(auth.tenantId, profile, config, options);
  return ok(content);
}

async function generateDailySocialContentForTenant(
  tenantId: string,
  profile: TenantProfile,
  config: CoreConfig,
  options?: { force?: boolean }
) {
  const timezone = profile.timezone ?? "UTC";
  const date = todayInTimezone(timezone);
  if (!options?.force) {
    const existing = await getDailySocialContentForDate(tenantId, date, config);
    if (existing) return existing;
  }

  const signals = await collectSignals(tenantId, config);
  const storeName = profile.storeName ?? "your store";
  const generated = await generateIdeas({ storeName, date, timezone, signals, config });
  const content: DailySocialContent = {
    tenantId,
    date,
    timezone,
    generatedAt: new Date().toISOString(),
    source: generated.source,
    storeName,
    summary: summaryForIdeas(generated.ideas),
    ideas: generated.ideas,
    signals,
  };
  await saveDailyContent(content, config);
  return content;
}

async function sendDailySocialContentPush(
  tenantId: string,
  content: DailySocialContent,
  config: CoreConfig
) {
  const { tokens, keys } = await listTenantPushTokensForRoles(tenantId, ["owner", "admin"], config);
  if (!tokens.length) return { sent: 0, staleRemoved: 0 };
  const tickets = await sendExpoPushMessages(
    tokens.map((to) => ({
      to,
      title: "Today's content ideas",
      body: content.summary,
      sound: "default" as const,
      priority: "default" as const,
      data: {
        type: "social_content_daily",
        route: CONTENT_IDEAS_ROUTE,
        date: content.date,
      },
    }))
  );

  let sent = 0;
  let staleRemoved = 0;
  for (let i = 0; i < tickets.length; i++) {
    const ticket = tickets[i] as ExpoPushTicket | undefined;
    const key = keys[i];
    if (!ticket || !key) continue;
    if (ticket.status === "ok") {
      sent += 1;
      continue;
    }
    const err = ticket.details?.error ?? ticket.message;
    if (err === "DeviceNotRegistered" || err === "InvalidCredentials") {
      await deletePushDevice(tenantId, key.userId, key.deviceKey, config);
      staleRemoved += 1;
    }
  }
  return { sent, staleRemoved };
}

export async function runDailySocialContentCron(config: CoreConfig): Promise<DailySocialContentResult> {
  const result: DailySocialContentResult = {
    scanned: 0,
    generated: 0,
    pushed: 0,
    staleRemoved: 0,
    failed: 0,
  };
  const tenants = await listTenantProfiles(config);
  for (const tenant of tenants) {
    result.scanned += 1;
    if (tenant.profile.status === "deleted" || tenant.profile.status === "suspended") continue;
    try {
      const content = await generateDailySocialContentForTenant(tenant.tenantId, tenant.profile, config);
      result.generated += 1;
      const push = await sendDailySocialContentPush(tenant.tenantId, content, config);
      result.pushed += push.sent;
      result.staleRemoved += push.staleRemoved;
    } catch (err) {
      result.failed += 1;
      console.warn("[social-content] tenant failed", tenant.tenantId, err instanceof Error ? err.message : err);
    }
  }
  return result;
}
