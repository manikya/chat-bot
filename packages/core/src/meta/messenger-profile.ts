import type { CoreConfig } from "../config";
import {
  resolveConversation,
  updateConversationProfile,
  type ConversationProfilePatch,
} from "../chat/conversation";
import { ensureFreshMessengerToken } from "../channels/service";
import { getMessengerUserProfile, type MessengerUserProfile } from "../channels/meta-client";

const PROFILE_RETRY_MS = 7 * 24 * 60 * 60 * 1000;

export function formatMessengerProfileName(profile: MessengerUserProfile): string | null {
  const parts = [profile.firstName, profile.lastName].filter((p): p is string => Boolean(p?.trim()));
  if (!parts.length) return null;
  return parts.join(" ");
}

/**
 * Best-effort Messenger display name from Meta User Profile API.
 * No-ops when a name is already stored, or when a recent lookup failed (weekly retry).
 */
export async function syncMessengerCustomerProfile(
  tenantId: string,
  psid: string,
  config: CoreConfig
): Promise<void> {
  const conversation = await resolveConversation(tenantId, "messenger", psid, config);

  if (conversation.customerName?.trim()) return;

  const lastLookupMs = conversation.profileLookupAt
    ? Date.parse(conversation.profileLookupAt)
    : 0;
  if (
    conversation.profileLookupStatus === "unavailable" &&
    lastLookupMs > 0 &&
    Date.now() - lastLookupMs < PROFILE_RETRY_MS
  ) {
    return;
  }

  const creds = await ensureFreshMessengerToken(tenantId, config);
  if (!creds) {
    console.warn("[messenger] profile sync skipped — missing page token for tenant", tenantId);
    return;
  }

  const now = new Date().toISOString();
  const profile = await getMessengerUserProfile(config, psid, creds.pageAccessToken);
  const customerName = profile ? formatMessengerProfileName(profile) : null;

  const patch: ConversationProfilePatch = {
    profileLookupAt: now,
    profileLookupStatus: customerName ? "ok" : "unavailable",
  };
  if (customerName) {
    patch.customerName = customerName;
    if (profile?.profilePicUrl) patch.profilePicUrl = profile.profilePicUrl;
  }

  await updateConversationProfile(tenantId, conversation, patch, config);
}
