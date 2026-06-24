import type { ChatIntent, ChatSubIntent, FunnelStage, QualificationState, WidgetAction } from "@commercechat/shared";
import type { CatalogSearchHints } from "../catalog/products";
import type { StoredMessage } from "./conversation";
import type { SearchProductHit } from "./product-reply";

export interface EngagementMove {
  question: string;
  suggestedActions?: WidgetAction[];
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function asList(value?: string | string[]): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => asList(item));
  return String(value ?? "")
    .split(/[,|;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function askedRecently(history: StoredMessage[] | undefined, question: string): boolean {
  const wanted = normalize(question).replace(/\b(what|which|who|do|you|is|it|for|the|a|an)\b/g, "").trim();
  if (!wanted) return false;
  return (history ?? [])
    .filter((message) => message.role === "assistant")
    .slice(-6)
    .some((message) => {
      const content = normalize(message.content);
      return content.includes(wanted) || normalize(question).split(" ").filter((word) => word.length > 3).every((word) => content.includes(word));
    });
}

function hasBudget(qualification?: QualificationState): boolean {
  return qualification?.budget?.max != null || qualification?.budget?.min != null;
}

function isGiftLike(qualification?: QualificationState): boolean {
  return Boolean(
    qualification?.category === "gift" ||
      qualification?.constraints?.some((constraint) =>
        /\bgifts?\b|birthday|anniversary|wedding|housewarming|father'?s day|mother'?s day/i.test(constraint)
      )
  );
}

function isEventLike(qualification?: QualificationState): boolean {
  return Boolean(
    qualification?.category === "event" ||
      qualification?.constraints?.some((constraint) =>
        /corporate|cooperate|event|giveaway|decor|award|appreciation/i.test(constraint)
      )
  );
}

function isHomeDecorLike(qualification?: QualificationState): boolean {
  const text = [qualification?.category, ...(qualification?.constraints ?? [])].join(" ");
  return /\b(home|decor|decoration|ornament|ceramic|table|festive)\b/i.test(text);
}

function productTerms(products: SearchProductHit[], keys: Array<keyof SearchProductHit>, catalogTerms?: string[]): string[] {
  const allowed = new Set((catalogTerms ?? []).map(normalize).filter(Boolean));
  const counts = new Map<string, { label: string; count: number }>();
  for (const product of products) {
    const seenForProduct = new Set<string>();
    for (const key of keys) {
      for (const value of asList(product[key] as string | string[] | undefined)) {
        const normalized = normalize(value);
        if (!normalized || normalized.length < 3 || seenForProduct.has(normalized)) continue;
        if (allowed.size && !allowed.has(normalized)) continue;
        seenForProduct.add(normalized);
        const existing = counts.get(normalized);
        counts.set(normalized, { label: existing?.label ?? value, count: (existing?.count ?? 0) + 1 });
      }
    }
  }
  return [...counts.values()]
    .filter((term) => term.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .map((term) => term.label)
    .slice(0, 3);
}

function suggestedMessageActionLabels(actions?: WidgetAction[]): string[] {
  return (actions ?? [])
    .filter((action) => action.type === "message")
    .map((action) => action.label || action.message || action.sku)
    .filter((value): value is string => Boolean(value));
}

function uniqueOptions(values: string[]): string[] {
  const seen = new Set<string>();
  const options: string[] = [];
  for (const value of values) {
    const label = value.trim();
    const normalized = normalize(label);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    options.push(label);
  }
  return options.slice(0, 3);
}

function optionPhrase(options: string[]): string {
  if (options.length <= 1) return options[0] ?? "";
  if (options.length === 2) return `${options[0]} or ${options[1]}`;
  return `${options.slice(0, -1).join(", ")}, or ${options[options.length - 1]}`;
}

function productText(product: SearchProductHit): string {
  return [
    product.name,
    product.description,
    product.category,
    ...(product.categories ?? []),
    product.tags,
    product.material,
    product.occasion,
    product.compatibility,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function productCategoryOptions(products: SearchProductHit[]): string[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const product of products) {
    for (const category of [product.category, ...(product.categories ?? [])]) {
      const label = category?.trim();
      const normalized = normalize(label ?? "");
      if (!label || !normalized) continue;
      const existing = counts.get(normalized);
      counts.set(normalized, { label: existing?.label ?? label, count: (existing?.count ?? 0) + 1 });
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .map((item) => item.label)
    .slice(0, 3);
}

function resultMatchesQualification(products: SearchProductHit[], qualification?: QualificationState): boolean {
  const terms = [qualification?.category, ...(qualification?.constraints ?? [])]
    .map((term) => term?.trim())
    .filter((term): term is string => Boolean(term && term.length >= 3))
    .filter((term) => !/gift|personal use/i.test(term));
  if (!terms.length) return true;
  return products.some((product) => {
    const text = productText(product);
    return terms.some((term) => text.includes(normalize(term)));
  });
}

function festiveResultShare(products: SearchProductHit[]): number {
  if (!products.length) return 0;
  const festive = products.filter((product) => /christmas|festive|santa|angel|ornament|holiday/i.test(productText(product))).length;
  return festive / products.length;
}

function preferenceActions(options: string[]): WidgetAction[] {
  return uniqueOptions(options).map((option) => ({
    type: "message" as const,
    label: option,
    message: `I prefer ${option}`,
  }));
}

function messageActions(values: Array<{ label: string; message: string }>): WidgetAction[] {
  return values.map((value) => ({ type: "message" as const, label: value.label, message: value.message }));
}

function resultRefinementMove(input: {
  products: SearchProductHit[];
  qualification?: QualificationState;
  catalogHints?: CatalogSearchHints;
  suggestedActions?: WidgetAction[];
}): EngagementMove | null {
  const { products, qualification, catalogHints, suggestedActions } = input;
  if (!products.length) return null;
  if (products.length === 1) {
    return {
      question: "Want to see similar options?",
      suggestedActions: messageActions([
        { label: "Similar options", message: `Show similar options to ${products[0]?.name ?? "this product"}` },
      ]),
    };
  }

  const actionLabels = suggestedMessageActionLabels(suggestedActions).slice(0, 3);
  const materialTerms = productTerms(products, ["material"], catalogHints?.materials);
  const occasionTerms = productTerms(products, ["occasion"], catalogHints?.occasions);
  const styleTerms = productTerms(products, ["tags", "compatibility"], [
    ...(catalogHints?.styles ?? []),
    ...(catalogHints?.tags ?? []),
    ...(catalogHints?.useCases ?? []),
  ]);
  const categoryOptions = productCategoryOptions(products);
  const categorySpread = categoryOptions.length;

  if (!resultMatchesQualification(products, qualification)) {
    const category = qualification?.category ?? qualification?.constraints?.[0] ?? "that";
    return {
      question: `I did not find an exact ${category} match. Want broader options or a different style?`,
      suggestedActions: messageActions([
        { label: "Broader options", message: "Show broader options" },
        { label: "Different style", message: "Show a different style" },
      ]),
    };
  }

  if (
    isHomeDecorLike(qualification) &&
    !qualification?.constraints?.some((constraint) => /christmas|festive|holiday/i.test(constraint)) &&
    festiveResultShare(products) >= 0.8
  ) {
    return {
      question: "I found mostly festive decor. Is Christmas/festive decor okay, or do you want everyday home decor?",
      suggestedActions: messageActions([
        { label: "Festive decor is okay", message: "Festive decor is okay" },
        { label: "Everyday home decor", message: "Show everyday home decor" },
      ]),
    };
  }

  if (categorySpread >= 3) {
    return {
      question: "I found a mixed set. Which category should I narrow to?",
      suggestedActions: categoryOptions.map((category) => ({
        type: "message" as const,
        label: category,
        message: `Narrow to ${category}`,
      })),
    };
  }

  if (isHomeDecorLike(qualification)) {
    const options = uniqueOptions([...materialTerms, ...styleTerms, ...occasionTerms]);
    if (options.length >= 2) {
      return {
        question: `Would you prefer ${optionPhrase(options)}?`,
        suggestedActions: preferenceActions(options),
      };
    }
    const fallback = ["Festive", "Minimal", "Decorative"];
    return {
      question: "Would you prefer something festive, minimal, or more decorative?",
      suggestedActions: preferenceActions(fallback),
    };
  }

  if (isGiftLike(qualification)) {
    if (!qualification?.constraints?.some((constraint) => /practical|sentimental|decorative/i.test(constraint))) {
      return {
        question: "Should it feel practical, sentimental, or decorative?",
        suggestedActions: occasionToneActions(),
      };
    }
    const options = uniqueOptions([...styleTerms, ...materialTerms, ...actionLabels]);
    if (options.length >= 2) {
      return {
        question: `Should I narrow these by ${optionPhrase(options)}?`,
        suggestedActions: preferenceActions(options),
      };
    }
    return {
      question: "Should I narrow these by style or budget?",
      suggestedActions: messageActions([
        { label: "By style", message: "Narrow these by style" },
        { label: "By budget", message: "Narrow these by budget" },
      ]),
    };
  }

  if (isEventLike(qualification)) {
    const options = uniqueOptions([...styleTerms, ...materialTerms]);
    if (options.length >= 2) {
      return {
        question: `Would you prefer ${optionPhrase(options)} for the event?`,
        suggestedActions: preferenceActions(options),
      };
    }
    return {
      question: "Do you need these for giveaways, table decor, or appreciation gifts?",
      suggestedActions: messageActions([
        { label: "Giveaways", message: "It's for event giveaways" },
        { label: "Table decor", message: "It's for event table decor" },
        { label: "Appreciation gifts", message: "It's for appreciation gifts" },
      ]),
    };
  }

  const options = uniqueOptions([...materialTerms, ...styleTerms, ...actionLabels]);
  if (options.length >= 2) {
    return {
      question: `Want me to narrow these by ${optionPhrase(options)}?`,
      suggestedActions: preferenceActions(options),
    };
  }
  return {
    question: "Want a different style or price range?",
    suggestedActions: messageActions([
      { label: "Different style", message: "Show me a different style" },
      { label: "Different budget", message: "Show me a different price range" },
    ]),
  };
}

function recipientActions(catalogHints?: CatalogSearchHints): WidgetAction[] | undefined {
  const recipients = uniqueOptions(catalogHints?.recipients ?? []);
  return recipients.length ? recipients.map((recipient) => ({
    type: "message" as const,
    label: `For ${recipient}`,
    message: `It's for ${recipient}`,
  })) : undefined;
}

function occasionToneActions(): WidgetAction[] {
  return preferenceActions(["Practical", "Sentimental", "Decorative"]);
}

function preProductMove(qualification?: QualificationState, catalogHints?: CatalogSearchHints): EngagementMove | null {
  if (!hasBudget(qualification)) {
    return {
      question: "What budget should I stay within?",
      suggestedActions: catalogHints?.priceBands?.slice(0, 3).map((band) => ({
        type: "message" as const,
        label: band.label,
        message: band.message,
      })),
    };
  }
  if (isGiftLike(qualification) && !qualification?.recipient) {
    return {
      question: "Who is this for?",
      suggestedActions: recipientActions(catalogHints),
    };
  }
  if (isGiftLike(qualification) && qualification?.recipient && !qualification?.constraints?.some((constraint) => /practical|sentimental|decorative/i.test(constraint))) {
    return {
      question: "Should it feel practical, sentimental, or decorative?",
      suggestedActions: occasionToneActions(),
    };
  }
  if (isEventLike(qualification) && !qualification?.constraints?.some((constraint) => /giveaway|decor|award|appreciation/i.test(constraint))) {
    return {
      question: "What is this for at the event?",
      suggestedActions: messageActions([
        { label: "Giveaways", message: "It's for event giveaways" },
        { label: "Table decor", message: "It's for event table decor" },
        { label: "Appreciation gifts", message: "It's for appreciation gifts" },
      ]),
    };
  }
  if (!qualification?.category && !qualification?.constraints?.length) {
    const categories = uniqueOptions([...(catalogHints?.occasions ?? []), ...(catalogHints?.categories ?? [])]);
    return {
      question: "What type of item are you looking for?",
      suggestedActions: categories.map((category) => ({
        type: "message" as const,
        label: category,
        message: `Show me ${category}`,
      })),
    };
  }
  return null;
}

export function chooseEngagementMove(input: {
  reply: string;
  intent?: ChatIntent;
  subIntent?: ChatSubIntent;
  funnelStage?: FunnelStage;
  qualification?: QualificationState;
  products?: SearchProductHit[];
  catalogHints?: CatalogSearchHints;
  suggestedActions?: WidgetAction[];
  history?: StoredMessage[];
}): EngagementMove | null {
  const trimmed = input.reply.trim();
  if (!trimmed || trimmed.endsWith("?")) return null;
  if (input.intent !== "product" && input.subIntent !== "product_browse") return null;
  if (input.funnelStage === "cart" || input.funnelStage === "checkout" || input.funnelStage === "objection") return null;

  const products = input.products ?? [];
  const move = products.length
    ? resultRefinementMove({
        products,
        qualification: input.qualification,
        catalogHints: input.catalogHints,
        suggestedActions: input.suggestedActions,
      })
    : preProductMove(input.qualification, input.catalogHints);

  if (!move || askedRecently(input.history, move.question)) return null;
  return move;
}

export function chooseEngagementQuestion(input: Parameters<typeof chooseEngagementMove>[0]): string | null {
  return chooseEngagementMove(input)?.question ?? null;
}

