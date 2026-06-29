import {
  getPlatformTenant,
  listPlatformTenants,
  loadConfig,
  updatePlatformTenant,
} from "@commercechat/core";
import type { TenantPlan, TenantStatus } from "@commercechat/shared";
import { createHandler } from "../lib/handler";
import { parseBody, pathParam, queryParam } from "../lib/apigw";

export const listHandler = createHandler(
  async (event, auth) =>
    listPlatformTenants(
      auth!,
      {
        q: queryParam(event, "q"),
        status: queryParam(event, "status"),
        plan: queryParam(event, "plan"),
        limit: queryParam(event, "limit") ? Number(queryParam(event, "limit")) : undefined,
        cursor: queryParam(event, "cursor"),
      },
      loadConfig()
    ),
  { requireAuth: true }
);

export const getHandler = createHandler(
  async (event, auth) => getPlatformTenant(auth!, pathParam(event, "tenantId")!, loadConfig()),
  { requireAuth: true }
);

export const patchHandler = createHandler(
  async (event, auth) => {
    const body = parseBody<{ status?: TenantStatus; plan?: TenantPlan }>(event);
    return updatePlatformTenant(auth!, pathParam(event, "tenantId")!, body, loadConfig());
  },
  { requireAuth: true }
);
