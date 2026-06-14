/** Client-side chat locale presets (mirrors packages/core/src/chat/locale.ts). */

const LK_TIMEZONES = new Set(["Asia/Colombo"]);

export function isSriLankaTimezone(timezone?: string): boolean {
  return Boolean(timezone && LK_TIMEZONES.has(timezone));
}

export const LK_SUGGESTED_QUESTIONS = [
  "Delivery kohomada?",
  "Return policy mokakda?",
  "Best sellers pennanna puluwanda?",
  "Order eka track karanna puluwanda?",
  "Me product eka stock eka thiyenawada?",
];

export const DEFAULT_SUGGESTED_QUESTIONS = ["What are your best sellers?", "Do you ship internationally?", "What is your return policy?", "Track my order"];

export function suggestedQuestionsForTimezone(timezone?: string): string[] {
  return isSriLankaTimezone(timezone) ? LK_SUGGESTED_QUESTIONS : DEFAULT_SUGGESTED_QUESTIONS;
}

export function onboardingTestGreeting(storeName?: string, timezone?: string): string {
  if (isSriLankaTimezone(timezone)) {
    return storeName
      ? `Ayubowan! Vanakkam! I'm ${storeName}'s assistant — ask in English, Sinhala, Tamil, or Singlish.`
      : "Ayubowan! Vanakkam! Ask in English, Sinhala, Tamil, or Singlish.";
  }
  return "Hi! I'm your store assistant. Ask about products, shipping, or orders.";
}
