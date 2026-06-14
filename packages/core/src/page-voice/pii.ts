const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g;
const CARD_RE = /\b(?:\d[ -]*?){13,19}\b/g;

export function scrubPii(text: string): string {
  return text
    .replace(EMAIL_RE, "[EMAIL]")
    .replace(CARD_RE, "[CARD]")
    .replace(PHONE_RE, "[PHONE]");
}
