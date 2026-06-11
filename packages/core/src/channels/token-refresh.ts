import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import type { CoreConfig } from "../config";
import { getDocClient } from "../db/client";
import { loadMetaCredentials } from "./credentials";
import { loadMessengerCredentials } from "./messenger-credentials";
import { ensureFreshMessengerToken, ensureFreshMetaToken } from "./service";

const REFRESH_WITHIN_MS = 7 * 24 * 60 * 60 * 1000;

export interface MetaTokenRefreshResult {
  scanned: number;
  refreshed: number;
  failed: number;
  details: Array<{ tenantId: string; channel: string; status: string }>;
}

async function listConnectedMetaChannels(config: CoreConfig) {
  const db = getDocClient(config);
  const rows: Array<{ tenantId: string; channel: "whatsapp" | "messenger" }> = [];
  let startKey: Record<string, unknown> | undefined;

  do {
    const res = await db.send(
      new ScanCommand({
        TableName: config.tableName,
        FilterExpression: "begins_with(SK, :sk) AND #status = :connected",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":sk": "CHANNEL#",
          ":connected": "connected",
        },
        ExclusiveStartKey: startKey,
      })
    );

    for (const item of res.Items ?? []) {
      const sk = String(item.SK ?? "");
      if (!sk.startsWith("CHANNEL#")) continue;
      const channel = sk.slice("CHANNEL#".length);
      if (channel !== "whatsapp" && channel !== "messenger") continue;
      const pk = String(item.PK ?? "");
      if (!pk.startsWith("TENANT#")) continue;
      rows.push({ tenantId: pk.slice("TENANT#".length), channel });
    }

    startKey = res.LastEvaluatedKey;
  } while (startKey);

  return rows;
}

function tokenExpiresSoon(tokenExpiresAt?: string): boolean {
  if (!tokenExpiresAt) return false;
  const expiresMs = Date.parse(tokenExpiresAt);
  if (Number.isNaN(expiresMs)) return false;
  return expiresMs - Date.now() < REFRESH_WITHIN_MS;
}

/** Refresh WhatsApp + Messenger tokens that expire within 7 days. */
export async function refreshExpiringMetaTokens(
  config: CoreConfig
): Promise<MetaTokenRefreshResult> {
  const channels = await listConnectedMetaChannels(config);
  const result: MetaTokenRefreshResult = {
    scanned: channels.length,
    refreshed: 0,
    failed: 0,
    details: [],
  };

  for (const { tenantId, channel } of channels) {
    try {
      if (channel === "whatsapp") {
        const before = await import("./credentials").then((m) =>
          m.loadMetaCredentials(tenantId, config)
        );
        if (!before || !tokenExpiresSoon(before.tokenExpiresAt)) {
          result.details.push({ tenantId, channel, status: "skipped" });
          continue;
        }
        const after = await ensureFreshMetaToken(tenantId, config);
        const refreshed = Boolean(after && after.accessToken !== before.accessToken);
        if (refreshed) result.refreshed += 1;
        result.details.push({
          tenantId,
          channel,
          status: refreshed ? "refreshed" : "unchanged",
        });
      } else {
        const before = await loadMessengerCredentials(tenantId, config);
        if (!before || !tokenExpiresSoon(before.tokenExpiresAt)) {
          result.details.push({ tenantId, channel, status: "skipped" });
          continue;
        }
        const after = await ensureFreshMessengerToken(tenantId, config);
        const refreshed = Boolean(
          after && after.pageAccessToken !== before.pageAccessToken
        );
        if (refreshed) result.refreshed += 1;
        result.details.push({
          tenantId,
          channel,
          status: refreshed ? "refreshed" : "unchanged",
        });
      }
    } catch (err) {
      result.failed += 1;
      result.details.push({
        tenantId,
        channel,
        status: err instanceof Error ? err.message : "error",
      });
    }
  }

  return result;
}
