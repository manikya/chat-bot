import type { ChatIntent, ChatSubIntent, FunnelStage, QualificationState, WidgetAction } from "@commercechat/shared";
import type { CatalogSearchHints } from "../catalog/products";
import type { StoredMessage } from "./conversation";
import type { SearchProductHit } from "./product-reply";

export interface EngagementMove {
  question: string;
  suggestedActions?: WidgetAction[];
}

function normalize(value: string): string {
  let output = "";
  let previousWasSpace = true;
  for (const char of value.toLowerCase()) {
    const code = char.charCodeAt(0);
    const isWordChar = (code >= 48 && code <= 57) || (code >= 97 && code <= 122);
    if (isWordChar) {
      output += char;
      previousWasSpace = false;
    } else if (!previousWasSpace) {
      output += " ";
      previousWasSpace = true;
    }
  }
  return output.trim();
}

function words(value: string): string[] {
  return normalize(value).split(" ").filter(Boolean);
}

function includesPhrase(value: string, phrase: string): boolean {
  const sourceWords = words(value);
  const phraseWords = words(phrase);
  if (!sourceWords.length || !phraseWords.length || phraseWords.length > sourceWords.length) return false;
  for (let index = 0; index <= sourceWords.length - phraseWords.length; index += 1) {
    if (phraseWords.every((word, offset) => sourceWords[index + offset] === word)) return true;
  }
  return false;
}

function includesAnyPhrase(value: string, phrases: string[]): boolean {
  return phrases.some((phrase) => includesPhrase(value, phrase));
}

function asList(value?: string | string[]): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => asList(item));
  const items: string[] = [];
  let current = "";
  for (const char of String(value ?? "")) {
    if (char === "," || char === "|" || char === ";") {
      if (current.trim()) items.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) items.push(current.trim());
  return items;
}

function askedRecently(history: StoredMessage[] | undefined, question: string): boolean {
  const stopWords = new Set(["what", "which", "who", "do", "you", "is", "it", "for", "the", "a", "an"]);
  const wanted = words(question).filter((word) => !stopWords.has(word)).join(" ");
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

function isGeneratedOfferingFlow(qualification?: QualificationState, catalogHints?: CatalogSearchHints): boolean {
  const terms = [qualification?.category, ...(qualification?.constraints ?? [])].join(" ");
  const generatedTerms = [
    ...(catalogHints?.offeringTypes ?? []),
    ...(catalogHints?.useCases ?? []),
    ...(catalogHints?.occasions ?? []),
    ...(catalogHints?.audiences ?? []),
    ...(catalogHints?.recipients ?? []),
  ];
  return Boolean(
    qualification?.recipient ||
    qualification?.category === "gift" ||
      qualification?.category === "event" ||
      generatedTerms.some((term) => includesAnyPhrase(terms, [term]))
  );
}

function isGeneratedUseCaseFlow(qualification?: QualificationState, catalogHints?: CatalogSearchHints): boolean {
  const terms = [qualification?.category, ...(qualification?.constraints ?? [])].join(" ");
  const useCaseTerms = [...(catalogHints?.useCases ?? []), ...Object.keys(catalogHints?.useCaseProfiles ?? {})];
  return Boolean(qualification?.category === "event" || useCaseTerms.some((term) => includesAnyPhrase(terms, [term])));
}

function isHomeDecorLike(qualification?: QualificationState): boolean {
  const text = [qualification?.category, ...(qualification?.constraints ?? [])].join(" ");
  return includesAnyPhrase(text, ["home", "decor", "decoration", "ornament", "ceramic", "table", "festive"]);
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
    .filter((term) => !includesAnyPhrase(term, ["gift", "personal use"]));
  if (!terms.length) return true;
  return products.some((product) => {
    const text = productText(product);
    return terms.some((term) => text.includes(normalize(term)));
  });
}

function festiveResultShare(products: SearchProductHit[]): number {
  if (!products.length) return 0;
  const festive = products.filter((product) =>
    includesAnyPhrase(productText(product), ["christmas", "festive", "santa", "angel", "ornament", "holiday"])
  ).length;
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
    !qualification?.constraints?.some((constraint) => includesAnyPhrase(constraint, ["christmas", "festive", "holiday"])) &&
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
    return null;
  }

  if (isGeneratedOfferingFlow(qualification, catalogHints)) {
    const factors = uniqueOptions((catalogHints?.decisionFactors ?? []).filter((factor) => normalize(factor) !== "budget"));
    if (factors.length >= 2 && !qualification?.constraints?.some((constraint) => factors.some((factor) => includesAnyPhrase(constraint, [factor])))) {
      return {
        question: `Should I narrow these by ${optionPhrase(factors)}?`,
        suggestedActions: preferenceActions(factors),
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

  if (isGeneratedUseCaseFlow(qualification, catalogHints)) {
    const options = uniqueOptions([...styleTerms, ...materialTerms]);
    if (options.length >= 2) {
      return {
        question: `Would you prefer ${optionPhrase(options)}?`,
        suggestedActions: preferenceActions(options),
      };
    }
    const useCases = uniqueOptions([...(catalogHints?.useCases ?? []), ...Object.keys(catalogHints?.useCaseProfiles ?? {})]);
    return {
      question: useCases.length ? "What is this for?" : "Want me to narrow these by use case or price range?",
      suggestedActions: useCases.length
        ? useCases.map((useCase) => ({ type: "message" as const, label: useCase, message: `It's for ${useCase}` }))
        : messageActions([
            { label: "Use case", message: "Narrow by use case" },
            { label: "Price range", message: "Show a different price range" },
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
  const recipients = uniqueOptions(catalogHints?.audiences?.length ? catalogHints.audiences : catalogHints?.recipients ?? []);
  return recipients.length ? recipients.map((recipient) => ({
    type: "message" as const,
    label: `For ${recipient}`,
    message: `It's for ${recipient}`,
  })) : undefined;
}

function decisionFactorActions(catalogHints?: CatalogSearchHints): WidgetAction[] {
  const factors = uniqueOptions((catalogHints?.decisionFactors ?? []).filter((factor) => normalize(factor) !== "budget"));
  return factors.length ? preferenceActions(factors) : [];
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
  if (isGeneratedOfferingFlow(qualification, catalogHints) && !qualification?.recipient && (catalogHints?.audiences?.length || catalogHints?.recipients?.length)) {
    return {
      question: "Who is this for?",
      suggestedActions: recipientActions(catalogHints),
    };
  }
  if (isGeneratedOfferingFlow(qualification, catalogHints) && qualification?.recipient) {
    const actions = decisionFactorActions(catalogHints);
    if (!actions.length) return null;
    return {
      question: `Should I narrow by ${optionPhrase(actions.map((action) => action.label))}?`,
      suggestedActions: actions,
    };
  }
  if (isGeneratedUseCaseFlow(qualification, catalogHints)) {
    const useCases = uniqueOptions([...(catalogHints?.useCases ?? []), ...Object.keys(catalogHints?.useCaseProfiles ?? {})]);
    if (!useCases.length) return null;
    return {
      question: "What is this for?",
      suggestedActions: useCases.map((useCase) => ({ type: "message" as const, label: useCase, message: `It's for ${useCase}` })),
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

