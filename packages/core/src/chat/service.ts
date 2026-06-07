import { ok, type AuthContext } from "@commercechat/shared";
import type { CoreConfig } from "../config";
import { runChatOrchestrator } from "./orchestrator";

export interface ChatRequestBody {
  channel?: string;
  externalUserId?: string;
  message?: string | { type?: string; content?: string };
}

function normalizeMessage(body: ChatRequestBody): string {
  if (typeof body.message === "string") return body.message;
  if (body.message && typeof body.message === "object") {
    return body.message.content ?? "";
  }
  return "";
}

export async function processChat(
  auth: AuthContext,
  body: ChatRequestBody,
  config: CoreConfig
) {
  const channel = body.channel ?? "test";
  const externalUserId = body.externalUserId ?? auth.userId;
  const message = normalizeMessage(body);

  const result = await runChatOrchestrator(
    auth,
    { channel, externalUserId, message },
    config
  );
  return ok(result);
}
