import {
  connectWordPressStore,
  disconnectWordPressStore,
  getWordPressConnectorStatus,
  getWordPressWidgetBootstrap,
  getWordPressWidgetSettings,
  loadConfig,
  setWordPressWidgetEnabled,
  syncKnowledgeSource,
  type ConnectWordPressBody,
} from "@commercechat/core";
import { ApiError, ErrorCodes } from "@commercechat/shared";
import { createApiKeyHandler, createHandler } from "../lib/handler";
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

export const widgetSettingsHandler = createHandler(
  async (_event, auth) => getWordPressWidgetSettings(auth!, loadConfig()),
  { requireAuth: true }
);

export const widgetPatchHandler = createHandler(
  async (event, auth) => {
    const body = parseBody<{ widgetEnabled?: boolean }>(event);
    if (typeof body.widgetEnabled !== "boolean") {
      throw new ApiError(ErrorCodes.VALIDATION_ERROR, "widgetEnabled must be a boolean", 400);
    }
    return setWordPressWidgetEnabled(auth!, body.widgetEnabled, loadConfig());
  },
  { requireAuth: true }
);

/** Public (store API key) — WordPress plugin fetches widget config with the same cc_wp_ key. */
export const widgetBootstrapHandler = createApiKeyHandler(async (_event, tenantId) =>
  getWordPressWidgetBootstrap(tenantId, loadConfig())
);
