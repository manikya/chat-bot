import {
  loadConfig,
  removeTeamMember,
  updateTeamMemberRole,
} from "@commercechat/core";
import type { UserRole } from "@commercechat/shared";
import { ApiError, ErrorCodes } from "@commercechat/shared";
import { createHandler } from "../lib/handler";
import { parseBody, pathParam } from "../lib/apigw";

export const deleteHandler = createHandler(
  async (event, auth) => {
    const userId = pathParam(event, "userId");
    if (!userId) throw new ApiError(ErrorCodes.VALIDATION_ERROR, "userId is required", 400);
    return removeTeamMember(auth!, userId, loadConfig());
  },
  { requireAuth: true, successStatus: 204, noBody: true }
);

export const patchHandler = createHandler(
  async (event, auth) => {
    const userId = pathParam(event, "userId");
    if (!userId) throw new ApiError(ErrorCodes.VALIDATION_ERROR, "userId is required", 400);
    const body = parseBody<{ role: UserRole }>(event);
    return updateTeamMemberRole(auth!, userId, body, loadConfig());
  },
  { requireAuth: true }
);
