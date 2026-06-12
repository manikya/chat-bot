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
  deleteMessengerCredentials,
  loadMessengerCredentials,
  saveMessengerCredentials,
} from "./messenger-credentials";
import {
  MetaGraphError,
  debugAccessToken,
  discoverWabaFromAccessToken,
  exchangeOAuthCode,
  expiresAtFromSeconds,
  validatePageAccessToken,
  getPhoneNumberDetails,
  listUserPages,
  listWabaPhoneNumbers,
  refreshLongLivedToken,
  subscribePageToApp,
  subscribeWabaToApp,
} from "./meta-client";
import type {
  ConnectMetaBody,
  ConnectMessengerBody,
  MessengerCredentials,
  MetaCredentials,
} from "./types";

const META_CHANNELS = ["whatsapp", "messenger", "instagram"] as const;

function assertCanManageChannels(auth: AuthContext) {
  if (auth.role === "viewer") {
    throw new ApiError(ErrorCodes.FORBIDDEN, "Insufficient permissions", 403);
  }
}

export async function getChannelRecord(tenantId: string, channel: string, config: CoreConfig) {
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

async function putPageRouting(pageId: string, tenantId: string, config: CoreConfig) {
  const db = getDocClient(config);
  const now = new Date().toISOString();
  await db.send(
    new PutCommand({
      TableName: config.tableName,
      Item: {
        PK: Keys.pageRoutingPk(pageId),
        SK: Keys.pageRoutingSk(),
        tenantId,
        pageId,
        connectedAt: now,
      },
    })
  );
}

async function deletePageRouting(pageId: string, config: CoreConfig) {
  const db = getDocClient(config);
  await db.send(
    new DeleteCommand({
      TableName: config.tableName,
      Key: { PK: Keys.pageRoutingPk(pageId), SK: Keys.pageRoutingSk() },
    })
  );
}

export async function resolveTenantByPageId(
  pageId: string,
  config: CoreConfig
): Promise<string | null> {
  const db = getDocClient(config);
  const res = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.pageRoutingPk(pageId), SK: Keys.pageRoutingSk() },
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

const TOKEN_REFRESH_WITHIN_MS = 7 * 24 * 60 * 60 * 1000;

export async function ensureFreshMetaToken(
  tenantId: string,
  config: CoreConfig
): Promise<MetaCredentials | null> {
  const creds = await loadMetaCredentials(tenantId, config);
  if (!creds) return null;

  const expiresMs = creds.tokenExpiresAt ? Date.parse(creds.tokenExpiresAt) : 0;
  const needsRefresh =
    expiresMs > 0 && expiresMs - Date.now() < TOKEN_REFRESH_WITHIN_MS;
  if (!needsRefresh) return creds;

  try {
    const refreshed = await refreshLongLivedToken(config, creds.accessToken);
    const updated: MetaCredentials = {
      ...creds,
      accessToken: refreshed.accessToken,
      tokenExpiresAt: expiresAtFromSeconds(refreshed.expiresIn),
      updatedAt: new Date().toISOString(),
    };
    await saveMetaCredentials(tenantId, updated, config);
    return updated;
  } catch {
    return creds;
  }
}

export async function ensureFreshMessengerToken(
  tenantId: string,
  config: CoreConfig
): Promise<MessengerCredentials | null> {
  const creds = await loadMessengerCredentials(tenantId, config);
  if (!creds) return null;

  const expiresMs = creds.tokenExpiresAt ? Date.parse(creds.tokenExpiresAt) : 0;
  const needsRefresh =
    expiresMs > 0 && expiresMs - Date.now() < TOKEN_REFRESH_WITHIN_MS;
  if (!needsRefresh) return creds;

  try {
    const refreshed = await refreshLongLivedToken(config, creds.pageAccessToken);
    const updated: MessengerCredentials = {
      ...creds,
      pageAccessToken: refreshed.accessToken,
      tokenExpiresAt: expiresAtFromSeconds(refreshed.expiresIn),
      updatedAt: new Date().toISOString(),
    };
    await saveMessengerCredentials(tenantId, updated, config);
    return updated;
  } catch {
    return creds;
  }
}

export async function listChannels(auth: AuthContext, config: CoreConfig) {
  const whatsapp = await getChannelRecord(auth.tenantId, "whatsapp", config);
  const messenger = await getChannelRecord(auth.tenantId, "messenger", config);
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
    {
      channel: "messenger" as const,
      status:
        messenger?.status === "connected" ? ("connected" as const) : ("disconnected" as const),
      pageName: messenger?.pageName as string | undefined,
      connectedAt: messenger?.connectedAt as string | undefined,
    },
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

  await saveMetaCredentials(auth.tenantId, creds, config);

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

async function persistMessengerConnection(
  auth: AuthContext,
  creds: MessengerCredentials,
  config: CoreConfig
) {
  const db = getDocClient(config);
  const now = new Date().toISOString();

  const existing = await getChannelRecord(auth.tenantId, "messenger", config);
  if (existing?.pageId && existing.pageId !== creds.pageId) {
    await deletePageRouting(String(existing.pageId), config);
  }

  await saveMessengerCredentials(auth.tenantId, creds, config);

  await db.send(
    new PutCommand({
      TableName: config.tableName,
      Item: {
        PK: Keys.tenantPk(auth.tenantId),
        SK: Keys.channel("messenger"),
        channel: "messenger",
        status: "connected",
        pageId: creds.pageId,
        pageName: creds.pageName,
        tokenExpiresAt: creds.tokenExpiresAt,
        connectedAt: now,
        lastHealthCheck: now,
      },
    })
  );

  await putPageRouting(creds.pageId, auth.tenantId, config);

  try {
    await subscribePageToApp(config, creds.pageId, creds.pageAccessToken);
  } catch (err) {
    console.warn("[channels] Page subscribe warning:", err instanceof Error ? err.message : err);
  }
}

export function isMetaDevConnectConfigured(config: CoreConfig): boolean {
  return Boolean(
    config.metaDevAccessToken && config.metaDevWabaId && config.metaDevPhoneNumberId
  );
}

export function isMetaMessengerDevConnectConfigured(config: CoreConfig): boolean {
  return Boolean(config.metaDevPageId && config.metaDevPageAccessToken);
}

export async function connectMetaChannelWithDevCredentials(
  auth: AuthContext,
  config: CoreConfig
) {
  if (!isMetaDevConnectConfigured(config)) {
    throw new ApiError(
      ErrorCodes.NOT_FOUND,
      "Dev Meta credentials not configured (META_DEV_ACCESS_TOKEN, META_DEV_WABA_ID, META_DEV_PHONE_NUMBER_ID)",
      404
    );
  }

  return connectMetaChannel(
    auth,
    {
      accessToken: config.metaDevAccessToken,
      wabaId: config.metaDevWabaId,
      phoneNumberId: config.metaDevPhoneNumberId,
      displayPhone: config.metaDevDisplayPhone,
    },
    config
  );
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

export async function connectMessengerChannelWithDevCredentials(
  auth: AuthContext,
  config: CoreConfig
) {
  if (!isMetaMessengerDevConnectConfigured(config)) {
    throw new ApiError(
      ErrorCodes.NOT_FOUND,
      "Dev Messenger credentials not configured (META_DEV_PAGE_ID, META_DEV_PAGE_ACCESS_TOKEN)",
      404
    );
  }

  return connectMessengerChannel(
    auth,
    {
      pageId: config.metaDevPageId,
      pageAccessToken: config.metaDevPageAccessToken,
      pageName: config.metaDevPageName ?? "Dev Page",
    },
    config
  );
}

export async function connectMessengerChannel(
  auth: AuthContext,
  body: ConnectMessengerBody,
  config: CoreConfig
) {
  assertCanManageChannels(auth);

  try {
    return await connectMessengerChannelInner(auth, body, config);
  } catch (err) {
    if (err instanceof MetaGraphError) {
      throw new ApiError(ErrorCodes.VALIDATION_ERROR, err.message, err.status);
    }
    throw err;
  }
}

async function connectMessengerChannelInner(
  auth: AuthContext,
  body: ConnectMessengerBody,
  config: CoreConfig
) {
  let pageId = body.pageId?.trim();
  let pageName = body.pageName?.trim();
  let pageAccessToken = body.pageAccessToken?.trim();
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

    const pages = await listUserPages(config, userToken);
    if (!pages.length) {
      throw new ApiError(
        ErrorCodes.VALIDATION_ERROR,
        "No Facebook Pages found. Ensure you manage a Page and granted pages_show_list.",
        400
      );
    }

    if (!pageId && pages.length > 1) {
      return ok({
        needsPageSelection: true,
        pages: pages
          .filter((p) => p.access_token)
          .map((p) => ({
            id: p.id,
            name: p.name ?? p.id,
            pageAccessToken: p.access_token!,
          })),
      });
    }

    const selected = pageId ? pages.find((p) => p.id === pageId) : pages[0];
    if (!selected?.access_token) {
      throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Could not obtain Page access token", 400);
    }

    pageId = selected.id;
    pageName = pageName || selected.name || pageId;
    pageAccessToken = selected.access_token;
  }

  if (!pageId || !pageAccessToken) {
    throw new ApiError(
      ErrorCodes.VALIDATION_ERROR,
      "Provide OAuth code or pageId with pageAccessToken",
      400
    );
  }

  if (!pageName) {
    pageName = pageId;
  }

  const creds: MessengerCredentials = {
    pageId,
    pageName,
    pageAccessToken,
    tokenExpiresAt,
    updatedAt: new Date().toISOString(),
  };

  await persistMessengerConnection(auth, creds, config);

  return ok({
    connected: ["messenger"],
    messenger: {
      pageId,
      pageName,
      status: "connected",
    },
  });
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

    try {
      const longLived = await refreshLongLivedToken(config, accessToken);
      accessToken = longLived.accessToken;
      tokenExpiresAt = expiresAtFromSeconds(longLived.expiresIn) ?? tokenExpiresAt;
    } catch {
      // short-lived token is enough to finish setup
    }

    const debug = await debugAccessToken(config, accessToken);
    wabaId = wabaId || (await discoverWabaFromAccessToken(config, accessToken, debug));
    if (!wabaId) {
      throw new ApiError(
        ErrorCodes.VALIDATION_ERROR,
        "Could not determine WhatsApp Business Account. Reconnect and select your WhatsApp Business account in Meta, or ensure your Facebook user manages a WABA.",
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
  const record = await getChannelRecord(auth.tenantId, channel, config);
  if (!record) {
    return ok({ channel, status: "disconnected" });
  }

  const db = getDocClient(config);
  const now = new Date().toISOString();

  if (channel === "whatsapp") {
    if (record.phoneNumberId) {
      await deletePhoneRouting(String(record.phoneNumberId), config);
    }
    await deleteMetaCredentials(auth.tenantId, config);
    await db.send(
      new UpdateCommand({
        TableName: config.tableName,
        Key: { PK: Keys.tenantPk(auth.tenantId), SK: Keys.channel(channel) },
        UpdateExpression:
          "SET #status = :disconnected, disconnectedAt = :now REMOVE phoneNumberId, wabaId, displayPhone, tokenExpiresAt",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":disconnected": "disconnected", ":now": now },
      })
    );
  } else if (channel === "messenger") {
    if (record.pageId) {
      await deletePageRouting(String(record.pageId), config);
    }
    await deleteMessengerCredentials(auth.tenantId, config);
    await db.send(
      new UpdateCommand({
        TableName: config.tableName,
        Key: { PK: Keys.tenantPk(auth.tenantId), SK: Keys.channel(channel) },
        UpdateExpression:
          "SET #status = :disconnected, disconnectedAt = :now REMOVE pageId, pageName, tokenExpiresAt",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":disconnected": "disconnected", ":now": now },
      })
    );
  } else {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Only WhatsApp and Messenger disconnect are supported", 400);
  }

  return ok({ channel, status: "disconnected" });
}

export async function getChannelHealth(auth: AuthContext, config: CoreConfig) {
  const whatsapp = await getChannelRecord(auth.tenantId, "whatsapp", config);
  const messenger = await getChannelRecord(auth.tenantId, "messenger", config);
  const now = new Date().toISOString();
  const health: Record<string, { status: string; lastCheck: string; detail?: string }> = {
    whatsapp: { status: "disconnected", lastCheck: now },
    messenger: { status: "disconnected", lastCheck: now },
    instagram: { status: "disconnected", lastCheck: now },
  };

  if (whatsapp?.status === "connected" && whatsapp.phoneNumberId) {
    const creds = await ensureFreshMetaToken(auth.tenantId, config);
    if (!creds) {
      health.whatsapp = { status: "error", lastCheck: now, detail: "Missing credentials" };
    } else {
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
    }
  }

  if (messenger?.status === "connected" && messenger.pageId) {
    const creds = await ensureFreshMessengerToken(auth.tenantId, config);
    if (!creds) {
      health.messenger = { status: "error", lastCheck: now, detail: "Missing credentials" };
    } else {
      try {
        await validatePageAccessToken(config, creds.pageAccessToken, creds.pageId);
        health.messenger = {
          status: "healthy",
          lastCheck: now,
          detail: creds.pageName ? `page=${creds.pageName}` : `page_id=${creds.pageId}`,
        };
        const db = getDocClient(config);
        await db.send(
          new UpdateCommand({
            TableName: config.tableName,
            Key: { PK: Keys.tenantPk(auth.tenantId), SK: Keys.channel("messenger") },
            UpdateExpression: "SET lastHealthCheck = :now, #status = :connected",
            ExpressionAttributeNames: { "#status": "status" },
            ExpressionAttributeValues: { ":now": now, ":connected": "connected" },
          })
        );
      } catch (err) {
        const message = err instanceof MetaGraphError ? err.message : "Health check failed";
        health.messenger = { status: "error", lastCheck: now, detail: message };
      }
    }
  }

  return ok(health);
}
