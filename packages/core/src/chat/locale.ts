/** Sri Lanka market presets — English, Sinhala, Tamil, and Singlish shoppers. */

import type { ChatIntent, ChatSubIntent, FunnelStage } from "@commercechat/shared";

export type ChatMarket = "default" | "lk";

const LK_TIMEZONES = new Set(["Asia/Colombo"]);

export function marketFromTimezone(timezone?: string): ChatMarket {
  if (timezone && LK_TIMEZONES.has(timezone)) return "lk";
  return "default";
}

export const LK_FAQ_KEYWORDS = [
  "ship",
  "shipping",
  "deliver",
  "delivery",
  "yanna",
  "return",
  "refund",
  "policy",
  "hours",
  "warranty",
  "exchange",
  "cod",
  "cash on delivery",
  "ගෙන",
  "ප්‍රතිලාභ",
  "அனுப்ப",
  "திரும்ப",
];

export const LK_PRODUCT_KEYWORDS = [
  "buy",
  "price",
  "gana",
  "size",
  "color",
  "recommend",
  "product",
  "have",
  "stock",
  "cost",
  "mokak",
  "mokada",
  "pennanna",
  "show me",
  "best seller",
  "cheapest",
  "discount",
  "offer",
];

export const LK_CHECKOUT_KEYWORDS = [
  "cart",
  "checkout",
  "order",
  "pay",
  "purchase",
  "add to",
  "track",
  "bill",
  "payment",
  "ගෙදර",
  "ஆர்டர்",
];

/** Price, trust, and policy concerns during shopping (funnel objection stage). */
export const LK_OBJECTION_KEYWORDS = [
  "too expensive",
  "expensive",
  "overpriced",
  "cheaper",
  "discount",
  "not sure",
  "trust",
  "scam",
  "legit",
  "warranty",
  "guarantee",
  "why so",
  "mahal",
  "වැඩිය",
  "அதிகம்",
];

/** Matches common EN / Singlish / Sinhala / Tamil openers. */
export const LK_GREETING_PATTERN =
  /^(hi|hello|hey|halo|howdy|ayubowan|ayubo|vanakkam|koheda|kohomada|good\s+(morning|afternoon|evening)|greetings|අයුබෝ|வணக்க)/i;

export function languageRulesForMarket(market: ChatMarket): string {
  if (market !== "lk") return "";
  return `
Language (Sri Lanka):
- Reply in the same language and script the customer uses: English, Sinhala (සිංහල), Tamil (தமிழ்), or Singlish (mixed).
- Match Singlish tone when they mix languages (e.g. "order eka", "mokak da best price").
- Keep product names, SKUs, prices, and URLs accurate — do not translate product titles unless the customer asks.
- Use LKR for prices when showing amounts unless context uses another currency.
- Keep WhatsApp replies short and conversational; plain text only (no markdown).`;
}

export function lkDefaultGreeting(storeName: string): string {
  return `Ayubowan! Vanakkam! I'm ${storeName}'s assistant — ask in English, Sinhala, Tamil, or Singlish.`;
}

export function lkDefaultSystemPrompt(storeName: string): string {
  return `You are ${storeName}'s AI shopping assistant for customers in Sri Lanka. Help them find products, answer delivery and return questions, and complete purchases. Many customers write in English, Sinhala, Tamil, or Singlish — always reply in their language.`;
}

export const LK_SUGGESTED_QUESTIONS = [
  "Delivery kohomada?",
  "Return policy mokakda?",
  "Best sellers pennanna puluwanda?",
  "Order eka track karanna puluwanda?",
  "Me product eka stock eka thiyenawada?",
];

export function defaultSuggestedQuestions(market: ChatMarket): string[] {
  if (market === "lk") return [...LK_SUGGESTED_QUESTIONS];
  return ["Shipping info", "Best sellers", "Return policy"];
}

export function suggestedQuestionsForChatContext(options: {
  market?: ChatMarket;
  intent?: ChatIntent;
  funnelStage?: FunnelStage;
  subIntent?: ChatSubIntent;
  defaults?: string[];
}): string[] {
  const market = options.market ?? "default";
  const base = options.defaults ?? defaultSuggestedQuestions(market);

  if (options.funnelStage === "cart" || options.subIntent === "cart_review") {
    return market === "lk"
      ? ["Cart eka pennanna", "Checkout karanna", "Product eka add karanna"]
      : ["Show my cart", "Checkout now", "Add another item"];
  }
  if (options.funnelStage === "checkout" || options.subIntent === "checkout_ready") {
    return market === "lk"
      ? ["Checkout link eka", "Payment kohomada?", "Delivery kohomada?"]
      : ["Get checkout link", "Payment options?", "When will it ship?"];
  }
  if (options.subIntent === "order_status") {
    return market === "lk"
      ? ["Order track karanna", "Delivery date", "Contact support"]
      : ["Track my order", "Delivery status", "Contact support"];
  }
  if (
    options.intent === "faq" ||
    options.subIntent === "faq_policy" ||
    options.subIntent === "faq_objection" ||
    options.funnelStage === "objection"
  ) {
    return market === "lk"
      ? ["Return policy mokakda?", "Delivery kohomada?", "Warranty thiyenawada?"]
      : ["Return policy", "Shipping times", "Warranty info"];
  }
  if (options.subIntent === "product_compare" || options.funnelStage === "compare") {
    return market === "lk"
      ? ["Me deka compare karanna", "Price difference mokakda?", "Best option mokakda?"]
      : ["Compare these options", "Which is better value?", "Show differences"];
  }
  if (options.subIntent === "product_detail") {
    return market === "lk"
      ? ["Size guide", "Stock thiyenawada?", "Similar products"]
      : ["Size guide", "Is it in stock?", "Similar products"];
  }
  if (options.intent === "product" || options.subIntent === "product_browse") {
    return market === "lk"
      ? ["Best sellers pennanna", "Gift ideas", "Budget options"]
      : ["Best sellers", "Gift ideas", "Budget options"];
  }
  if (options.intent === "greeting") {
    return base.slice(0, 3);
  }

  return base.slice(0, 3);
}

export function formatMoney(amount: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat("en-LK", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount)}`;
  }
}
