import { createHmac, timingSafeEqual } from "crypto";
import type { CoreConfig } from "../config";

export function verifyMetaWebhookChallenge(
  config: CoreConfig,
  mode: string | undefined,
  verifyToken: string | undefined,
  challenge: string | undefined
): string | null {
  if (mode !== "subscribe" || !challenge || !config.metaVerifyToken) return null;
  if (verifyToken !== config.metaVerifyToken) return null;
  return challenge;
}

export function verifyMetaWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  appSecret: string | undefined
): boolean {
  if (!signatureHeader || !appSecret) return false;
  const expected = signatureHeader.replace(/^sha256=/i, "");
  const digest = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  try {
    return timingSafeEqual(Buffer.from(digest, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}
