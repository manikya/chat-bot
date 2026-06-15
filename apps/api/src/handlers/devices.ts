import {
  loadConfig,
  registerPushDevice,
  unregisterPushDevice,
  type RegisterPushDeviceBody,
} from "@commercechat/core";
import { ApiError, ErrorCodes } from "@commercechat/shared";
import { createHandler } from "../lib/handler";
import { parseBody } from "../lib/apigw";

export const handler = createHandler(
  async (event, auth) => {
    const config = loadConfig();
    const method = event.requestContext.http.method;
    const body = parseBody<RegisterPushDeviceBody>(event);

    if (method === "POST") {
      return registerPushDevice(auth!, body, config);
    }
    if (method === "DELETE") {
      return unregisterPushDevice(auth!, body, config);
    }

    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Method not allowed", 405);
  },
  { requireAuth: true }
);
