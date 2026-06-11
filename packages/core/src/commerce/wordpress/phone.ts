/** Normalize phone to digits for display-free matching (mirrors WP plugin logic). */
export function phoneDigits(phone: string): string {
  return phone.replace(/\D+/g, "");
}

export function phoneMatchCandidates(phone: string): string[] {
  const digits = phoneDigits(phone);
  if (!digits) return [];

  const candidates = new Set<string>([digits]);

  if (digits.startsWith("94") && digits.length >= 11) {
    candidates.add(digits.slice(2));
  }
  if (digits.startsWith("0") && digits.length >= 10) {
    candidates.add(digits.slice(1));
    candidates.add(`94${digits.slice(1)}`);
  }
  if (digits.length === 9 && digits.startsWith("7")) {
    candidates.add(`0${digits}`);
    candidates.add(`94${digits}`);
  }

  return [...candidates];
}

export function phonesMatch(a: string, b: string): boolean {
  const ca = phoneMatchCandidates(a);
  const cb = phoneMatchCandidates(b);
  if (!ca.length || !cb.length) return false;

  for (const left of ca) {
    for (const right of cb) {
      if (left === right) return true;
      if (left.length >= 9 && right.length >= 9 && left.slice(-9) === right.slice(-9)) {
        return true;
      }
    }
  }
  return false;
}
