import { DeleteCommand, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ApiError, ErrorCodes, ok, type AuthContext } from "@commercechat/shared";
import type { CoreConfig } from "../config";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";
import {
  MetaGraphError,
  exchangeOAuthCode,
  expiresAtFromSeconds,
  listUserPagesWithInstagram,
  refreshLongLivedToken,
  subscribeInstagramToApp,
  validatePageAccessToken,
} from "./meta-client";
import {
  deleteInstagramCredentials,
  loadInstagramCredentials,
  saveInstagramCredentials,
} from "./instagram-credentials";
import type { ConnectInstagramBody, InstagramCredentials } from "./types";

const TOKEN_REFRESH_WITHIN_MS = 7 * 24 * 60 * 60 * 1000;

async function putIgRouting(igUserId: string, tenantId: string, config: CoreConfig) {
  const db = getDocClient(config);
  const now = new Date().toISOString();
  await db.send(
    new PutCommand({
      TableName: config.tableName,
      Item: {
        PK: Keys.igRoutingPk(igUserId),
        SK: Keys.igRoutingSk(),
        tenantId,
        igUserId,
        connectedAt: now,
      },
    })
  );
}

export async function deleteIgRouting(igUserId: string, config: CoreConfig) {
  const db = getDocClient(config);
  await db.send(
    new DeleteCommand({
      TableName: config.tableName,
      Key: { PK: Keys.igRoutingPk(igUserId), SK: Keys.igRoutingSk() },
    })
  );
}

export async function resolveTenantByIgUserId(
  igUserId: string,
  config: CoreConfig
): Promise<string | null> {
  const db = getDocClient(config);
  const res = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.igRoutingPk(igUserId), SK: Keys.igRoutingSk() },
    })
  );
  return (res.Item?.tenantId as string) ?? null;
}

async function persistInstagramConnection(
  auth: AuthContext,
  creds: InstagramCredentials,
  config: CoreConfig
) {
  const db = getDocClient(config);
  const now = new Date().toISOString();

  const existingRes = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(auth.tenantId), SK: Keys.channel("instagram") },
    })
  );
  const existing = existingRes.Item ?? null;
  if (existing?.igUserId && existing.igUserId !== creds.igUserId) {
    await deleteIgRouting(String(existing.igUserId), config);
  }

  await saveInstagramCredentials(auth.tenantId, creds, config);

  await db.send(
    new PutCommand({
      TableName: config.tableName,
      Item: {
        PK: Keys.tenantPk(auth.tenantId),
        SK: Keys.channel("instagram"),
        channel: "instagram",
        status: "connected",
        pageId: creds.pageId,
        pageName: creds.pageName,
        igUserId: creds.igUserId,
        igUsername: creds.igUsername,
        tokenExpiresAt: creds.tokenExpiresAt,
        connectedAt: now,
        lastHealthCheck: now,
      },
    })
  );

  await putIgRouting(creds.igUserId, auth.tenantId, config);

  try {
    await subscribeInstagramToApp(config, creds.igUserId, creds.pageAccessToken);
  } catch (err) {
    console.warn("[channels] Instagram subscribe warning:", err instanceof Error ? err.message : err);
  }
}

export async function ensureFreshInstagramToken(
  tenantId: string,
  config: CoreConfig
): Promise<InstagramCredentials | null> {
  const creds = await loadInstagramCredentials(tenantId, config);
  if (!creds) return null;

  const expiresMs = creds.tokenExpiresAt ? Date.parse(creds.tokenExpiresAt) : 0;
  const needsRefresh =
    expiresMs > 0 && expiresMs - Date.now() < TOKEN_REFRESH_WITHIN_MS;
  if (!needsRefresh) return creds;

  try {
    const refreshed = await refreshLongLivedToken(config, creds.pageAccessToken);
    const updated: InstagramCredentials = {
      ...creds,
      pageAccessToken: refreshed.accessToken,
      tokenExpiresAt: expiresAtFromSeconds(refreshed.expiresIn),
      updatedAt: new Date().toISOString(),
    };
    await saveInstagramCredentials(tenantId, updated, config);
    return updated;
  } catch {
    return creds;
  }
}

export async function connectInstagramChannel(
  auth: AuthContext,
  body: ConnectInstagramBody,
  config: CoreConfig
) {
  try {
    return await connectInstagramChannelInner(auth, body, config);
  } catch (err) {
    if (err instanceof MetaGraphError) {
      throw new ApiError(ErrorCodes.VALIDATION_ERROR, err.message, err.status);
    }
    throw err;
  }
}

async function connectInstagramChannelInner(
  auth: AuthContext,
  body: ConnectInstagramBody,
  config: CoreConfig
) {
  let pageId = body.pageId?.trim();
  let pageName = body.pageName?.trim();
  let pageAccessToken = body.pageAccessToken?.trim();
  let igUserId = body.igUserId?.trim();
  let igUsername = body.igUsername?.trim();
  let tokenExpiresAt: string | undefined;

  if (!pageAccessToken && body.code) {
    const redirectUri = body.redirectUri?.trim() || config.metaOAuthRedirectUri;
    if (!redirectUri) {
      throw new ApiError(ErrorCodes.VALIDATION_ERROR, "redirectUri is required with OAuth code", 400);
    }

    const exchanged = await exchangeOAuthCode(config, body.code, redirectUri);
    let userToken = exchanged.accessToken;
    tokenExpiresAt = expiresAtFromSeconds(exchanged.expiresIn);

    try {
      const longLived = await refreshLongLivedToken(config, userToken);
      userToken = longLived.accessToken;
      tokenExpiresAt = expiresAtFromSeconds(longLived.expiresIn) ?? tokenExpiresAt;
    } catch {
      // short-lived user token may still list pages
    }

    const pages = (await listUserPagesWithInstagram(config, userToken)).filter(
      (p) => p.access_token && p.instagram_business_account?.id
    );

    if (!pages.length) {
      throw new ApiError(
        ErrorCodes.VALIDATION_ERROR,
        "No Instagram Business accounts found. Link Instagram to a Facebook Page and grant instagram_manage_messages.",
        400
      );
    }

    if (!pageId && pages.length > 1) {
      return ok({
        needsPageSelection: true,
        pages: pages.map((p) => ({
          id: p.id,
          name: p.name ?? p.id,
          pageAccessToken: p.access_token!,
          igUserId: p.instagram_business_account!.id,
          igUsername: p.instagram_business_account!.username,
        })),
      });
    }

    const selected = pageId ? pages.find((p) => p.id === pageId) : pages[0];
    if (!selected?.access_token || !selected.instagram_business_account?.id) {
      throw new ApiError(
        ErrorCodes.VALIDATION_ERROR,
        "Could not obtain Page access token with linked Instagram account",
        400
      );
    }

    pageId = selected.id;
    pageName = pageName || selected.name || pageId;
    pageAccessToken = selected.access_token;
    igUserId = selected.instagram_business_account.id;
    igUsername = igUsername || selected.instagram_business_account.username;
  }

  if (!pageId || !pageAccessToken || !igUserId) {
    throw new ApiError(
      ErrorCodes.VALIDATION_ERROR,
      "Provide OAuth code or pageId with pageAccessToken and igUserId",
      400
    );
  }

  if (!pageName) pageName = pageId;
  if (!igUsername) igUsername = igUserId;

  const creds: InstagramCredentials = {
    pageId,
    pageName,
    pageAccessToken,
    igUserId,
    igUsername,
    tokenExpiresAt,
    updatedAt: new Date().toISOString(),
  };

  await persistInstagramConnection(auth, creds, config);

  return ok({
    connected: ["instagram"],
    instagram: {
      pageId,
      pageName,
      igUserId,
      igUsername,
      status: "connected",
    },
  });
}

export async function disconnectInstagramChannel(
  auth: AuthContext,
  config: CoreConfig
) {
  const db = getDocClient(config);
  const recordRes = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(auth.tenantId), SK: Keys.channel("instagram") },
    })
  );
  const record = recordRes.Item ?? null;
  if (!record) {
    return ok({ channel: "instagram", status: "disconnected" });
  }

  const now = new Date().toISOString();

  if (record.igUserId) {
    await deleteIgRouting(String(record.igUserId), config);
  }
  await deleteInstagramCredentials(auth.tenantId, config);
  await db.send(
    new UpdateCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(auth.tenantId), SK: Keys.channel("instagram") },
      UpdateExpression:
        "SET #status = :disconnected, disconnectedAt = :now REMOVE pageId, pageName, igUserId, igUsername, tokenExpiresAt",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":disconnected": "disconnected", ":now": now },
    })
  );

  return ok({ channel: "instagram", status: "disconnected" });
}

export async function checkInstagramHealth(
  auth: AuthContext,
  config: CoreConfig,
  now: string
) {
  const db = getDocClient(config);
  const instagramRes = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(auth.tenantId), SK: Keys.channel("instagram") },
    })
  );
  const instagram = instagramRes.Item ?? null;
  if (instagram?.status !== "connected" || !instagram.igUserId) {
    return { status: "disconnected", lastCheck: now };
  }

  const creds = await ensureFreshInstagramToken(auth.tenantId, config);
  if (!creds) {
    return { status: "error", lastCheck: now, detail: "Missing credentials" };
  }

  try {
    await validatePageAccessToken(config, creds.pageAccessToken, creds.pageId);
    const db = getDocClient(config);
    await db.send(
      new UpdateCommand({
        TableName: config.tableName,
        Key: { PK: Keys.tenantPk(auth.tenantId), SK: Keys.channel("instagram") },
        UpdateExpression: "SET lastHealthCheck = :now, #status = :connected",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":now": now, ":connected": "connected" },
      })
    );
    return {
      status: "healthy",
      lastCheck: now,
      detail: creds.igUsername ? `@${creds.igUsername}` : `ig_id=${creds.igUserId}`,
    };
  } catch (err) {
    const message = err instanceof MetaGraphError ? err.message : "Health check failed";
    return { status: "error", lastCheck: now, detail: message };
  }
}
