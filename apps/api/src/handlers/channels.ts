import {
  connectMetaChannel,
  connectMetaChannelWithDevCredentials,
  connectMessengerChannel,
  connectMessengerChannelWithDevCredentials,
  connectInstagramChannel,
  disconnectMetaChannel,
  getChannelHealth,
  isMetaDevConnectConfigured,
  isMetaMessengerDevConnectConfigured,
  listChannels,
  loadConfig,
  type ConnectMetaBody,
  type ConnectMessengerBody,
  type ConnectInstagramBody,
} from "@commercechat/core";
import { ApiError, ErrorCodes, ok } from "@commercechat/shared";
import { createHandler } from "../lib/handler";
import { parseBody, pathParam } from "../lib/apigw";

export const listHandler = createHandler(
  async (_event, auth) => listChannels(auth!, loadConfig()),
  { requireAuth: true }
);

export const connectHandler = createHandler(
  async (event, auth) => {
    const body = parseBody<ConnectMetaBody>(event);
    return connectMetaChannel(auth!, body, loadConfig());
  },
  { requireAuth: true, minRole: "admin" }
);

export const connectMessengerHandler = createHandler(
  async (event, auth) => {
    const body = parseBody<ConnectMessengerBody>(event);
    return connectMessengerChannel(auth!, body, loadConfig());
  },
  { requireAuth: true, minRole: "admin" }
);

export const connectInstagramHandler = createHandler(
  async (event, auth) => {
    const body = parseBody<ConnectInstagramBody>(event);
    return connectInstagramChannel(auth!, body, loadConfig());
  },
  { requireAuth: true, minRole: "admin" }
);

export const disconnectHandler = createHandler(
  async (event, auth) => {
    const channel = pathParam(event, "channel");
    if (!channel) {
      throw new ApiError(ErrorCodes.VALIDATION_ERROR, "channel is required", 400);
    }
    return disconnectMetaChannel(auth!, channel, loadConfig());
  },
  { requireAuth: true, minRole: "admin", noBody: true, successStatus: 204 }
);

export const healthHandler = createHandler(
  async (_event, auth) => getChannelHealth(auth!, loadConfig()),
  { requireAuth: true }
);

export const devConnectHandler = createHandler(
  async (_event, auth) => connectMetaChannelWithDevCredentials(auth!, loadConfig()),
  { requireAuth: true }
);

export const messengerDevConnectHandler = createHandler(
  async (_event, auth) => connectMessengerChannelWithDevCredentials(auth!, loadConfig()),
  { requireAuth: true }
);

export const devStatusHandler = createHandler(async () => {
  const config = loadConfig();
  return ok({
    devConnectAvailable: isMetaDevConnectConfigured(config),
    messengerDevConnectAvailable: isMetaMessengerDevConnectConfigured(config),
    oauthRedirectUri: config.metaOAuthRedirectUri,
  });
}, { requireAuth: true });
