import { DeleteCommand, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ApiError, ErrorCodes, ok, type AuthContext } from "@commercechat/shared";
import type { CoreConfig } from "../config";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";
import {
  deleteMetaCredentials,
  loadMetaCredentials,
  saveMetaCredentials,
} from "./credentials";
import {
  MetaGraphError,
  debugAccessToken,
  discoverWabaIdFromDebug,
  exchangeOAuthCode,
  expiresAtFromSeconds,
  getPhoneNumberDetails,
  listWabaPhoneNumbers,
  refreshLongLivedToken,
  subscribeWabaToApp,
} from "./meta-client";
import type { ConnectMetaBody, MetaCredentials } from "./types";

const META_CHANNELS = ["whatsapp", "messenger", "instagram"] as const;

function assertCanManageChannels(auth: AuthContext) {
  if (auth.role === "viewer") {
    throw new ApiError(ErrorCodes.FORBIDDEN, "Insufficient permissions", 403);
  }
}

async function getChannelRecord(tenantId: string, channel: string, config: CoreConfig) {
  const db = getDocClient(config);
  const res = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.channel(channel) },
    })
  );
  return res.Item ?? null;
}

async function putPhoneRouting(
  phoneNumberId: string,
  tenantId: string,
  config: CoreConfig
) {
  const db = getDocClient(config);
  const now = new Date().toISOString();
  await db.send(
    new PutCommand({
      TableName: config.tableName,
      Item: {
        PK: Keys.phoneRoutingPk(phoneNumberId),
        SK: Keys.phoneRoutingSk(),
        tenantId,
        phoneNumberId,
        connectedAt: now,
      },
    })
  );
}

async function deletePhoneRouting(phoneNumberId: string, config: CoreConfig) {
  const db = getDocClient(config);
  await db.send(
    new DeleteCommand({
      TableName: config.tableName,
      Key: { PK: Keys.phoneRoutingPk(phoneNumberId), SK: Keys.phoneRoutingSk() },
    })
  );
}

export async function resolveTenantByPhoneNumberId(
  phoneNumberId: string,
  config: CoreConfig
): Promise<string | null> {
  const db = getDocClient(config);
  const res = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.phoneRoutingPk(phoneNumberId), SK: Keys.phoneRoutingSk() },
    })
  );
  return (res.Item?.tenantId as string) ?? null;
}

export async function getMetaCredentialsForTenant(
  tenantId: string,
  config: CoreConfig
): Promise<MetaCredentials | null> {
  return loadMetaCredentials(tenantId, config);
}

export async function ensureFreshMetaToken(
  tenantId: string,
  config: CoreConfig
): Promise<MetaCredentials | null> {
  const creds = loadMetaCredentials(tenantId, config);
  if (!creds) return null;

  const expiresMs = creds.tokenExpiresAt ? Date.parse(creds.tokenExpiresAt) : 0;
  const needsRefresh = expiresMs > 0 && expiresMs - Date.now() < 7 * 24 * 60 * 60 * 1000;
  if (!needsRefresh) return creds;

  try {
    const refreshed = await refreshLongLivedToken(config, creds.accessToken);
    const updated: MetaCredentials = {
      ...creds,
      accessToken: refreshed.accessToken,
      tokenExpiresAt: expiresAtFromSeconds(refreshed.expiresIn),
      updatedAt: new Date().toISOString(),
    };
    saveMetaCredentials(tenantId, updated, config);
    return updated;
  } catch {
    return creds;
  }
}

export async function listChannels(auth: AuthContext, config: CoreConfig) {
  const whatsapp = await getChannelRecord(auth.tenantId, "whatsapp", config);
  const configRes = await getDocClient(config).send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(auth.tenantId), SK: Keys.config() },
    })
  );
  const enabled = (configRes.Item?.enabledChannels as string[] | undefined) ?? ["web"];

  const channels = [
    {
      channel: "whatsapp" as const,
      status: whatsapp?.status === "connected" ? ("connected" as const) : ("disconnected" as const),
      displayPhone: whatsapp?.displayPhone as string | undefined,
      connectedAt: whatsapp?.connectedAt as string | undefined,
    },
    { channel: "messenger" as const, status: "disconnected" as const },
    { channel: "instagram" as const, status: "disconnected" as const },
    {
      channel: "web" as const,
      status: enabled.includes("web") ? ("connected" as const) : ("disconnected" as const),
      widgetEnabled: enabled.includes("web"),
    },
  ];

  return ok({ channels });
}

async function persistWhatsAppConnection(
  auth: AuthContext,
  creds: MetaCredentials,
  config: CoreConfig
) {
  const db = getDocClient(config);
  const now = new Date().toISOString();

  const existing = await getChannelRecord(auth.tenantId, "whatsapp", config);
  if (existing?.phoneNumberId && existing.phoneNumberId !== creds.phoneNumberId) {
    await deletePhoneRouting(String(existing.phoneNumberId), config);
  }

  saveMetaCredentials(auth.tenantId, creds, config);

  await db.send(
    new PutCommand({
      TableName: config.tableName,
      Item: {
        PK: Keys.tenantPk(auth.tenantId),
        SK: Keys.channel("whatsapp"),
        channel: "whatsapp",
        status: "connected",
        phoneNumberId: creds.phoneNumberId,
        wabaId: creds.wabaId,
        displayPhone: creds.displayPhone,
        tokenExpiresAt: creds.tokenExpiresAt,
        connectedAt: now,
        lastHealthCheck: now,
      },
    })
  );

  await putPhoneRouting(creds.phoneNumberId, auth.tenantId, config);

  try {
    await subscribeWabaToApp(config, creds.wabaId, creds.accessToken);
  } catch (err) {
    console.warn("[channels] WABA subscribe warning:", err instanceof Error ? err.message : err);
  }
}

export async function connectMetaChannel(
  auth: AuthContext,
  body: ConnectMetaBody,
  config: CoreConfig
) {
  assertCanManageChannels(auth);

  try {
    return await connectMetaChannelInner(auth, body, config);
  } catch (err) {
    if (err instanceof MetaGraphError) {
      throw new ApiError(ErrorCodes.VALIDATION_ERROR, err.message, err.status);
    }
    throw err;
  }
}

async function connectMetaChannelInner(
  auth: AuthContext,
  body: ConnectMetaBody,
  config: CoreConfig
) {

  let accessToken = body.accessToken?.trim();
  let wabaId = body.wabaId?.trim();
  let phoneNumberId = body.phoneNumberId?.trim();
  let displayPhone = body.displayPhone?.trim();
  let tokenExpiresAt: string | undefined;

  if (body.code) {
    const redirectUri = body.redirectUri?.trim() || config.metaOAuthRedirectUri;
    if (!redirectUri) {
      throw new ApiError(ErrorCodes.VALIDATION_ERROR, "redirectUri is required with OAuth code", 400);
    }
    const exchanged = await exchangeOAuthCode(config, body.code, redirectUri);
    accessToken = exchanged.accessToken;
    tokenExpiresAt = expiresAtFromSeconds(exchanged.expiresIn);

    const debug = await debugAccessToken(config, accessToken);
    wabaId = wabaId || discoverWabaIdFromDebug(debug);
    if (!wabaId) {
      throw new ApiError(
        ErrorCodes.VALIDATION_ERROR,
        "Could not determine WhatsApp Business Account from token",
        400
      );
    }
  }

  if (!accessToken || !wabaId || !phoneNumberId) {
    if (accessToken && wabaId && !phoneNumberId) {
      const phones = await listWabaPhoneNumbers(config, wabaId, accessToken);
      const preferred =
        phones.find((p) => p.status === "CONNECTED") ?? phones[0];
      if (!preferred) {
        throw new ApiError(ErrorCodes.VALIDATION_ERROR, "No phone numbers on WABA", 400);
      }
      phoneNumberId = preferred.id;
      displayPhone = displayPhone || preferred.display_phone_number;
    } else {
      throw new ApiError(
        ErrorCodes.VALIDATION_ERROR,
        "Provide OAuth code or accessToken with wabaId and phoneNumberId",
        400
      );
    }
  }

  const phoneDetails = await getPhoneNumberDetails(config, phoneNumberId, accessToken);
  displayPhone = displayPhone || phoneDetails.display_phone_number;

  const creds: MetaCredentials = {
    accessToken,
    wabaId,
    phoneNumberId,
    displayPhone,
    tokenExpiresAt,
    updatedAt: new Date().toISOString(),
  };

  await persistWhatsAppConnection(auth, creds, config);

  return ok({
    connected: ["whatsapp"],
    whatsapp: {
      phoneNumberId,
      displayPhone,
      wabaId,
      status: phoneDetails.status,
    },
    messenger: { status: "not_linked" },
    instagram: { status: "not_linked" },
  });
}

export async function disconnectMetaChannel(
  auth: AuthContext,
  channel: string,
  config: CoreConfig
) {
  assertCanManageChannels(auth);
  if (!META_CHANNELS.includes(channel as (typeof META_CHANNELS)[number])) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Invalid channel", 400);
  }
  if (channel !== "whatsapp") {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Only WhatsApp disconnect is supported in MVP", 400);
  }

  const record = await getChannelRecord(auth.tenantId, channel, config);
  if (!record) {
    return ok({ channel, status: "disconnected" });
  }

  if (record.phoneNumberId) {
    await deletePhoneRouting(String(record.phoneNumberId), config);
  }

  deleteMetaCredentials(auth.tenantId, config);

  const db = getDocClient(config);
  await db.send(
    new UpdateCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(auth.tenantId), SK: Keys.channel(channel) },
      UpdateExpression: "SET #status = :disconnected, disconnectedAt = :now REMOVE phoneNumberId, wabaId, displayPhone, tokenExpiresAt",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":disconnected": "disconnected",
        ":now": new Date().toISOString(),
      },
    })
  );

  return ok({ channel, status: "disconnected" });
}

export async function getChannelHealth(auth: AuthContext, config: CoreConfig) {
  const whatsapp = await getChannelRecord(auth.tenantId, "whatsapp", config);
  const health: Record<string, { status: string; lastCheck: string; detail?: string }> = {
    messenger: { status: "disconnected", lastCheck: new Date().toISOString() },
    instagram: { status: "disconnected", lastCheck: new Date().toISOString() },
  };

  const now = new Date().toISOString();

  if (whatsapp?.status !== "connected" || !whatsapp.phoneNumberId) {
    health.whatsapp = { status: "disconnected", lastCheck: now };
    return ok(health);
  }

  const creds = await ensureFreshMetaToken(auth.tenantId, config);
  if (!creds) {
    health.whatsapp = { status: "error", lastCheck: now, detail: "Missing credentials" };
    return ok(health);
  }

  try {
    const details = await getPhoneNumberDetails(
      config,
      String(whatsapp.phoneNumberId),
      creds.accessToken
    );
    const apiStatus = details.status === "CONNECTED" ? "healthy" : "degraded";
    health.whatsapp = {
      status: apiStatus,
      lastCheck: now,
      detail: details.status ? `phone_status=${details.status}` : undefined,
    };

    const db = getDocClient(config);
    await db.send(
      new UpdateCommand({
        TableName: config.tableName,
        Key: { PK: Keys.tenantPk(auth.tenantId), SK: Keys.channel("whatsapp") },
        UpdateExpression: "SET lastHealthCheck = :now, #status = :connected",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":now": now, ":connected": "connected" },
      })
    );
  } catch (err) {
    const message = err instanceof MetaGraphError ? err.message : "Health check failed";
    health.whatsapp = { status: "error", lastCheck: now, detail: message };
  }

  return ok(health);
}
