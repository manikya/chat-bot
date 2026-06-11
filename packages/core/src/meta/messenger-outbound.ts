import type { CoreConfig } from "../config";
import { loadMessengerCredentials } from "../channels/messenger-credentials";
import { sendMessengerText } from "../channels/meta-client";

export async function sendMessengerReply(
  tenantId: string,
  recipientId: string,
  text: string,
  config: CoreConfig
) {
  const creds = loadMessengerCredentials(tenantId, config);
  if (!creds) throw new Error("Missing Messenger credentials for tenant");

  return sendMessengerText(config, creds.pageAccessToken, recipientId, text);
}
