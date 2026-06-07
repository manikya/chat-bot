import { randomBytes } from "crypto";

export function generateId(prefix: string): string {
  return `${prefix}${randomBytes(6).toString("hex")}`;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
