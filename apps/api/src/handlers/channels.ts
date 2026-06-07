import {
  connectMetaChannel,
  disconnectMetaChannel,
  getChannelHealth,
  listChannels,
  loadConfig,
  type ConnectMetaBody,
} from "@commercechat/core";
import { ApiError, ErrorCodes } from "@commercechat/shared";
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
  { requireAuth: true }
);

export const disconnectHandler = createHandler(
  async (event, auth) => {
    const channel = pathParam(event, "channel");
    if (!channel) {
      throw new ApiError(ErrorCodes.VALIDATION_ERROR, "channel is required", 400);
    }
    return disconnectMetaChannel(auth!, channel, loadConfig());
  },
  { requireAuth: true, noBody: true, successStatus: 204 }
);

export const healthHandler = createHandler(
  async (_event, auth) => getChannelHealth(auth!, loadConfig()),
  { requireAuth: true }
);
