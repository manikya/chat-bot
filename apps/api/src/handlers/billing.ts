import {
  cancelBillingSubscription,
  createBillingCheckout,
  getBillingOverview,
  getBillingSubscription,
  listBillingPlans,
  loadConfig,
  reactivateBillingSubscription,
} from "@commercechat/core";
import type { TenantPlan } from "@commercechat/shared";
import { createHandler } from "../lib/handler";
import { parseBody } from "../lib/apigw";

export const plansHandler = createHandler(async () => listBillingPlans(), { requireAuth: true });

export const subscriptionHandler = createHandler(
  async (_event, auth) => getBillingSubscription(auth!, loadConfig()),
  { requireAuth: true }
);

export const overviewHandler = createHandler(
  async (_event, auth) => getBillingOverview(auth!, loadConfig()),
  { requireAuth: true }
);

export const checkoutHandler = createHandler(
  async (event, auth) => {
    const body = parseBody<{ plan: TenantPlan; successUrl?: string; cancelUrl?: string }>(event);
    return createBillingCheckout(auth!, body, loadConfig());
  },
  { requireAuth: true, minRole: "owner" }
);

export const cancelHandler = createHandler(
  async (_event, auth) => cancelBillingSubscription(auth!, loadConfig()),
  { requireAuth: true, minRole: "owner" }
);

export const reactivateHandler = createHandler(
  async (_event, auth) => reactivateBillingSubscription(auth!, loadConfig()),
  { requireAuth: true, minRole: "owner" }
);
