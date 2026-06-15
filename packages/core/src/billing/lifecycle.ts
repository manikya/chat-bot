import { ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { CoreConfig } from "../config";
import { createEmailProvider } from "../email/provider";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";
import { expireTrialIfNeeded } from "../tenant/status";

export interface BillingLifecycleResult {
  scanned: number;
  trialsExpired: number;
  subscriptionsEnded: number;
  emailsSent: number;
  failed: number;
}

type BillingNotices = {
  trial3d?: string;
  trial1d?: string;
  trialExpired?: string;
  subscriptionEnded?: string;
};

function trialDaysRemaining(periodEnd: string | undefined | null): number | null {
  if (!periodEnd) return null;
  const ms = new Date(periodEnd).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

async function listTenantProfiles(config: CoreConfig) {
  const db = getDocClient(config);
  const rows: Array<{ tenantId: string; profile: Record<string, unknown> }> = [];
  let startKey: Record<string, unknown> | undefined;

  do {
    const res = await db.send(
      new ScanCommand({
        TableName: config.tableName,
        FilterExpression: "SK = :sk AND begins_with(PK, :pk)",
        ExpressionAttributeValues: {
          ":sk": Keys.profile(),
          ":pk": "TENANT#",
        },
        ExclusiveStartKey: startKey,
      })
    );

    for (const item of res.Items ?? []) {
      const pk = String(item.PK ?? "");
      if (!pk.startsWith("TENANT#")) continue;
      rows.push({ tenantId: pk.slice("TENANT#".length), profile: item });
    }

    startKey = res.LastEvaluatedKey;
  } while (startKey);

  return rows;
}

async function markNoticeSent(
  tenantId: string,
  key: keyof BillingNotices,
  config: CoreConfig
) {
  const db = getDocClient(config);
  const now = new Date().toISOString();
  await db.send(
    new UpdateCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.profile() },
      UpdateExpression: "SET billingNotices.#k = :n, updatedAt = :u",
      ExpressionAttributeNames: { "#k": key },
      ExpressionAttributeValues: { ":n": now, ":u": now },
    })
  );
}

async function suspendTenant(tenantId: string, config: CoreConfig) {
  const now = new Date().toISOString();
  const db = getDocClient(config);
  await db.send(
    new UpdateCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.profile() },
      UpdateExpression: "SET #status = :s, updatedAt = :u",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":s": "suspended", ":u": now },
    })
  );
}

async function sendBillingEmail(
  config: CoreConfig,
  to: string,
  subject: string,
  text: string
): Promise<boolean> {
  const provider = createEmailProvider(config);
  if (!provider) return false;
  try {
    await provider.sendRawEmail(to, subject, text);
    return true;
  } catch (err) {
    console.warn("[billing-lifecycle] email failed", to, err);
    return false;
  }
}

export async function runBillingLifecycle(config: CoreConfig): Promise<BillingLifecycleResult> {
  const result: BillingLifecycleResult = {
    scanned: 0,
    trialsExpired: 0,
    subscriptionsEnded: 0,
    emailsSent: 0,
    failed: 0,
  };

  const tenants = await listTenantProfiles(config);
  result.scanned = tenants.length;
  const appUrl = config.appUrl.replace(/\/$/, "");

  for (const { tenantId, profile: rawProfile } of tenants) {
    try {
      const beforeStatus = rawProfile.status as string;
      let profile = await expireTrialIfNeeded(tenantId, rawProfile, config);
      const status = profile.status as string;
      const plan = profile.plan as string;
      const ownerEmail = (profile.ownerEmail as string | undefined)?.trim();
      const storeName = (profile.storeName as string | undefined) ?? "your store";
      const periodEnd = profile.billingPeriodEnd as string | undefined;
      const notices = (profile.billingNotices as BillingNotices | undefined) ?? {};

      if (beforeStatus === "trial" && status === "suspended") {
        result.trialsExpired += 1;
        if (!notices.trialExpired && ownerEmail) {
          if (
            await sendBillingEmail(
              config,
              ownerEmail,
              "Your CommerceChat trial has ended",
              `Hi,\n\nYour CommerceChat trial for ${storeName} has ended and messaging is paused.\n\nChoose a plan to restore service:\n${appUrl}/billing\n`
            )
          ) {
            result.emailsSent += 1;
            await markNoticeSent(tenantId, "trialExpired", config);
          }
        }
      }

      if (plan === "trial" && status === "trial" && periodEnd && ownerEmail) {
        const daysLeft = trialDaysRemaining(periodEnd);
        if (daysLeft !== null && daysLeft <= 3 && daysLeft > 1 && !notices.trial3d) {
          if (
            await sendBillingEmail(
              config,
              ownerEmail,
              `CommerceChat trial — ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`,
              `Hi,\n\nYour CommerceChat trial for ${storeName} ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"} (${new Date(periodEnd).toLocaleDateString()}).\n\nUpgrade before it ends to keep WhatsApp, Instagram, and web chat live:\n${appUrl}/billing\n`
            )
          ) {
            result.emailsSent += 1;
            await markNoticeSent(tenantId, "trial3d", config);
          }
        }
        if (daysLeft === 1 && !notices.trial1d) {
          if (
            await sendBillingEmail(
              config,
              ownerEmail,
              "CommerceChat trial ends tomorrow",
              `Hi,\n\nYour CommerceChat trial for ${storeName} ends tomorrow. Upgrade now to avoid interruption:\n${appUrl}/billing\n`
            )
          ) {
            result.emailsSent += 1;
            await markNoticeSent(tenantId, "trial1d", config);
          }
        }
      }

      if (
        status === "active" &&
        profile.cancelAtPeriodEnd &&
        periodEnd &&
        new Date(periodEnd).getTime() <= Date.now()
      ) {
        await suspendTenant(tenantId, config);
        result.subscriptionsEnded += 1;

        if (!notices.subscriptionEnded && ownerEmail) {
          if (
            await sendBillingEmail(
              config,
              ownerEmail,
              "CommerceChat subscription ended",
              `Hi,\n\nYour CommerceChat subscription for ${storeName} has ended as scheduled. Messaging is paused until you reactivate:\n${appUrl}/billing\n`
            )
          ) {
            result.emailsSent += 1;
            await markNoticeSent(tenantId, "subscriptionEnded", config);
          }
        }
      }
    } catch (err) {
      result.failed += 1;
      console.warn("[billing-lifecycle] tenant failed", tenantId, err);
    }
  }

  return result;
}
