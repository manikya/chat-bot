import {
  completeTenantLogoUpload,
  loadConfig,
  presignTenantLogoUpload,
} from "@commercechat/core";
import { createHandler } from "../lib/handler";
import { parseBody } from "../lib/apigw";

export const presignHandler = createHandler(
  async (event, auth) => {
    const body = parseBody<{ contentType: string }>(event);
    return presignTenantLogoUpload(auth!, body, loadConfig());
  },
  { requireAuth: true }
);

export const completeHandler = createHandler(
  async (event, auth) => {
    const body = parseBody<{ key: string }>(event);
    return completeTenantLogoUpload(auth!, body, loadConfig());
  },
  { requireAuth: true }
);
