import {
  createPlatformUser,
  listPlatformUsers,
  loadConfig,
  updatePlatformUser,
} from "@commercechat/core";
import type { PlatformUserRole, PlatformUserStatus } from "@commercechat/shared";
import { createHandler } from "../lib/handler";
import { parseBody, pathParam } from "../lib/apigw";

export const listHandler = createHandler(
  async (_event, auth) => listPlatformUsers(auth!, loadConfig()),
  { requireAuth: true }
);

export const createUserHandler = createHandler(
  async (event, auth) => {
    const body = parseBody<{ email: string; name: string; password: string; role?: PlatformUserRole }>(event);
    return createPlatformUser(auth!, body, loadConfig());
  },
  { requireAuth: true, successStatus: 201 }
);

export const patchHandler = createHandler(
  async (event, auth) => {
    const body = parseBody<{ name?: string; role?: PlatformUserRole; status?: PlatformUserStatus }>(event);
    return updatePlatformUser(auth!, decodeURIComponent(pathParam(event, "email")!), body, loadConfig());
  },
  { requireAuth: true }
);
