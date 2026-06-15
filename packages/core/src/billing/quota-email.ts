import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { CoreConfig } from "../config";
import { createEmailProvider } from "../email/provider";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";
import { getMonthlyUsage } from "../chat/usage";

const QUOTA_WARN_PCT = 80;

async function getTenantOwnerEmail(tenantId: string, config: CoreConfig) {
  const db = getDocClient(config);
  const res = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.profile() },
    })
  );
  return (res.Item?.ownerEmail as string | undefined)?.trim() || null;
}

async function getMaxMessages(tenantId: string, config: CoreConfig) {
  const db = getDocClient(config);
  const res = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.limits() },
    })
  );
  return Number(res.Item?.maxMessages ?? 2000);
}

/** Send one 80% message-quota warning email per billing period. */
export async function maybeSendMessageQuotaWarning(tenantId: string, config: CoreConfig) {
  const period = new Date().toISOString().slice(0, 7);
  const db = getDocClient(config);
  const [usage, maxMessages, ownerEmail] = await Promise.all([
    getMonthlyUsage(tenantId, config),
    getMaxMessages(tenantId, config),
    getTenantOwnerEmail(tenantId, config),
  ]);

  if (!ownerEmail || maxMessages <= 0) return;
  const pct = Math.round((usage.messages / maxMessages) * 100);
  if (pct < QUOTA_WARN_PCT) return;

  const usageKey = { PK: Keys.tenantPk(tenantId), SK: Keys.usage(period) };
  const usageRow = await db.send(new GetCommand({ TableName: config.tableName, Key: usageKey }));
  if (usageRow.Item?.message80PctSent) return;

  const appUrl = config.appUrl.replace(/\/$/, "");
  const provider = createEmailProvider(config);
  await provider.sendRawEmail(
    ownerEmail,
    `CommerceChat — ${pct}% of your monthly message limit used`,
    [
      `Hi,`,
      ``,
      `Your store has used ${usage.messages.toLocaleString()} of ${maxMessages.toLocaleString()} messages this month (${pct}%).`,
      `New AI replies may stop when you reach 100%.`,
      ``,
      `Review usage or upgrade your plan:`,
      `${appUrl}/usage`,
      `${appUrl}/billing`,
    ].join("\n")
  );

  await db.send(
    new UpdateCommand({
      TableName: config.tableName,
      Key: usageKey,
      UpdateExpression: "SET message80PctSent = :sent, #updatedAt = :u",
      ExpressionAttributeNames: { "#updatedAt": "updatedAt" },
      ExpressionAttributeValues: {
        ":sent": new Date().toISOString(),
        ":u": new Date().toISOString(),
      },
    })
  );
}
