import {
  connectWordPressStore,
  disconnectWordPressStore,
  getWordPressConnectorStatus,
  loadConfig,
  syncKnowledgeSource,
  type ConnectWordPressBody,
} from "@commercechat/core";
import { ApiError, ErrorCodes } from "@commercechat/shared";
import { createHandler } from "../lib/handler";
import { parseBody } from "../lib/apigw";

export const statusHandler = createHandler(
  async (_event, auth) => getWordPressConnectorStatus(auth!, loadConfig()),
  { requireAuth: true }
);

export const connectHandler = createHandler(
  async (event, auth) => {
    const body = parseBody<ConnectWordPressBody>(event);
    return connectWordPressStore(auth!, body, loadConfig());
  },
  { requireAuth: true }
);

export const disconnectHandler = createHandler(
  async (_event, auth) => disconnectWordPressStore(auth!, loadConfig()),
  { requireAuth: true, noBody: true, successStatus: 204 }
);

export const syncHandler = createHandler(
  async (_event, auth) => {
    const status = await getWordPressConnectorStatus(auth!, loadConfig());
    const sourceId = status.data?.sourceId;
    if (!sourceId) {
      throw new ApiError(ErrorCodes.VALIDATION_ERROR, "WooCommerce is not connected", 400);
    }
    return syncKnowledgeSource(auth!, sourceId, loadConfig());
  },
  { requireAuth: true, successStatus: 202 }
);
