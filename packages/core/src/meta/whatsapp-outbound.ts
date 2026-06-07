import type { CoreConfig } from "../config";
import { ensureFreshMetaToken } from "../channels/service";
import { sendWhatsAppText } from "../channels/meta-client";

export async function sendWhatsAppReply(
  tenantId: string,
  phoneNumberId: string,
  to: string,
  text: string,
  config: CoreConfig
) {
  const creds = await ensureFreshMetaToken(tenantId, config);
  if (!creds) throw new Error("Missing Meta credentials for tenant");

  return sendWhatsAppText(config, phoneNumberId, creds.accessToken, to, text);
}
