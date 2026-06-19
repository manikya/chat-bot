import { createHash } from "crypto";
import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import {
  ApiError,
  ErrorCodes,
  generateId,
  ok,
  type AuthContext,
  type TenantPlan,
} from "@commercechat/shared";
import type { CoreConfig } from "../config";
import { getMonthlyUsage, incrementIngestJobs } from "../chat/usage";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";
import { createVectorStore } from "../ingest/vectors";
import { resolveTenantProfile } from "../tenant/status";
import { getTenantLimits } from "../tenant/service";
import { BILLING_PLANS, getBillingPlan, isPlanUpgrade } from "./plans";

export { incrementIngestJobs };

const CHECKOUT_TTL_SEC = 24 * 60 * 60;

function assertOwner(auth: AuthContext) {
  if (auth.role !== "owner") {
    throw new ApiError(ErrorCodes.FORBIDDEN, "Owner access required", 403);
  }
}

function addMonths(iso: string, months: number): string {
  const d = new Date(iso);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString();
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function trialDaysRemaining(periodEnd: string | undefined | null): number | null {
  if (!periodEnd) return null;
  const ms = new Date(periodEnd).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

function planFeatureFlags(planId: TenantPlan) {
  switch (planId) {
    case "trial":
    case "pro":
      return { conversationIngest: true, socialIngest: false, humanHandoff: true };
    case "business":
    case "enterprise":
      return { conversationIngest: true, socialIngest: true, humanHandoff: true };
    default:
      return { conversationIngest: false, socialIngest: false, humanHandoff: false };
  }
}

function buildGatewayRedirectUrl(
  config: CoreConfig,
  input: {
    checkoutId: string;
    plan: TenantPlan;
    amountLkr: number;
    tenantId: string;
    successUrl: string;
    cancelUrl: string;
  }
): string | null {
  const template = config.paymentGatewayCheckoutUrl;
  if (!template) return null;
  return template
    .replaceAll("{checkoutId}", input.checkoutId)
    .replaceAll("{amountLkr}", String(input.amountLkr))
    .replaceAll("{plan}", input.plan)
    .replaceAll("{tenantId}", input.tenantId)
    .replaceAll("{successUrl}", encodeURIComponent(input.successUrl))
    .replaceAll("{cancelUrl}", encodeURIComponent(input.cancelUrl));
}

async function getProfile(tenantId: string, config: CoreConfig) {
  const db = getDocClient(config);
  const res = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.profile() },
    })
  );
  if (!res.Item) throw new ApiError(ErrorCodes.NOT_FOUND, "Tenant not found", 404);
  return res.Item;
}

async function countSources(tenantId: string, config: CoreConfig) {
  const db = getDocClient(config);
  const res = await db.send(
    new QueryCommand({
      TableName: config.tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": Keys.tenantPk(tenantId),
        ":sk": "SOURCE#",
      },
    })
  );
  return (res.Items ?? []).filter((i) => i.status !== "deleted").length;
}

async function countTeamMembers(tenantId: string, config: CoreConfig) {
  const db = getDocClient(config);
  const res = await db.send(
    new QueryCommand({
      TableName: config.tableName,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: {
        ":pk": Keys.tenantPk(tenantId),
        ":sk": "USER#",
      },
    })
  );
  return res.Items?.length ?? 0;
}

export async function listBillingPlans() {
  return ok({ plans: BILLING_PLANS });
}

export async function provisionTrialTenant(tenantId: string, config: CoreConfig) {
  const plan = getBillingPlan("trial");
  if (!plan) throw new ApiError(ErrorCodes.NOT_FOUND, "Trial plan missing", 500);

  const now = new Date().toISOString();
  const trialEnd = addDays(now, plan.trialDays ?? 14);
  const db = getDocClient(config);

  await db.send(
    new UpdateCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.profile() },
      UpdateExpression:
        "SET #plan = :plan, #status = :status, billingPeriodStart = :start, billingPeriodEnd = :end, trialEndsAt = :end, cancelAtPeriodEnd = :cancel, updatedAt = :u",
      ExpressionAttributeNames: { "#plan": "plan", "#status": "status" },
      ExpressionAttributeValues: {
        ":plan": "trial",
        ":status": "trial",
        ":start": now,
        ":end": trialEnd,
        ":cancel": false,
        ":u": now,
      },
    })
  );

  await db.send(
    new PutCommand({
      TableName: config.tableName,
      Item: {
        PK: Keys.tenantPk(tenantId),
        SK: Keys.limits(),
        ...plan.limits,
        updatedAt: now,
      },
    })
  );
}

export async function getBillingSubscription(auth: AuthContext, config: CoreConfig) {
  const profile = await resolveTenantProfile(auth.tenantId, config);

  const periodEnd = (profile.billingPeriodEnd as string | undefined) ?? null;
  const plan = profile.plan as TenantPlan;

  return ok({
    plan,
    status: profile.status as string,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: Boolean(profile.cancelAtPeriodEnd),
    billingPeriodStart: (profile.billingPeriodStart as string | undefined) ?? null,
    trialDaysRemaining: plan === "trial" ? trialDaysRemaining(periodEnd) : null,
  });
}

async function safeVectorCount(tenantId: string, config: CoreConfig) {
  try {
    return await createVectorStore(config).countByTenant(tenantId);
  } catch (err) {
    console.warn(
      "[billing] vector count unavailable; reporting 0",
      err instanceof Error ? err.message : err
    );
    return 0;
  }
}

export async function getBillingOverview(auth: AuthContext, config: CoreConfig) {
  const [subscriptionRes, limitsRes, usage, sources, teamMembers, vectorCount] = await Promise.all([
    getBillingSubscription(auth, config),
    getTenantLimits(auth, config),
    getMonthlyUsage(auth.tenantId, config),
    countSources(auth.tenantId, config),
    countTeamMembers(auth.tenantId, config),
    safeVectorCount(auth.tenantId, config),
  ]);

  const limits = limitsRes.data!;
  const maxMessages = Number(limits.maxMessages);
  const maxSources = Number(limits.maxSources);
  const maxTeamMembers = Number(limits.maxTeamMembers);
  const maxVectors = Number(limits.maxVectors);
  const currentPlan = getBillingPlan(subscriptionRes.data!.plan as TenantPlan);

  return ok({
    subscription: subscriptionRes.data,
    usage: {
      period: usage.period,
      messages: usage.messages,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      ingestJobs: usage.ingestJobs,
      estimatedLlmCostUsd: Number(
        ((usage.inputTokens * 0.15 + usage.outputTokens * 0.6) / 1_000_000).toFixed(4)
      ),
    },
    limits,
    resources: {
      sources,
      teamMembers,
      vectors: vectorCount,
      messagesRemaining: Math.max(0, maxMessages - usage.messages),
    },
    utilization: {
      messagesPct: maxMessages > 0 ? Math.min(100, Math.round((usage.messages / maxMessages) * 100)) : 0,
      sourcesPct: maxSources > 0 ? Math.min(100, Math.round((sources / maxSources) * 100)) : 0,
      teamPct:
        maxTeamMembers > 0 ? Math.min(100, Math.round((teamMembers / maxTeamMembers) * 100)) : 0,
      vectorsPct: maxVectors > 0 ? Math.min(100, Math.round((vectorCount / maxVectors) * 100)) : 0,
    },
    planDetails: currentPlan
      ? {
          name: currentPlan.name,
          features: currentPlan.features,
          priceLkr: currentPlan.priceLkr,
          priceUsd: currentPlan.priceUsd,
        }
      : null,
  });
}

export async function applyPlanToTenant(tenantId: string, planId: TenantPlan, config: CoreConfig) {
  const plan = getBillingPlan(planId);
  if (!plan || plan.contactSales) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Invalid plan", 400);
  }

  const now = new Date().toISOString();
  const periodEnd =
    planId === "trial" ? addDays(now, plan.trialDays ?? 14) : addMonths(now, 1);
  const db = getDocClient(config);
  const { limits } = plan;
  const flags = planFeatureFlags(planId);

  await db.send(
    new UpdateCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.profile() },
      UpdateExpression:
        "SET #plan = :plan, #status = :status, billingPeriodStart = :start, billingPeriodEnd = :end, cancelAtPeriodEnd = :cancel, updatedAt = :u",
      ExpressionAttributeNames: {
        "#plan": "plan",
        "#status": "status",
      },
      ExpressionAttributeValues: {
        ":plan": planId,
        ":status": planId === "trial" ? "trial" : "active",
        ":start": now,
        ":end": periodEnd,
        ":cancel": false,
        ":u": now,
      },
    })
  );

  await db.send(
    new PutCommand({
      TableName: config.tableName,
      Item: {
        PK: Keys.tenantPk(tenantId),
        SK: Keys.limits(),
        maxMessages: limits.maxMessages,
        maxSources: limits.maxSources,
        maxVectors: limits.maxVectors,
        maxTeamMembers: limits.maxTeamMembers,
        enabledChannels: limits.enabledChannels,
        updatedAt: now,
      },
    })
  );

  const configRes = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(tenantId), SK: Keys.config() },
    })
  );
  if (configRes.Item) {
    const existingFlags = (configRes.Item.featureFlags as Record<string, boolean>) ?? {};
    await db.send(
      new UpdateCommand({
        TableName: config.tableName,
        Key: { PK: Keys.tenantPk(tenantId), SK: Keys.config() },
        UpdateExpression: "SET featureFlags = :f, updatedAt = :u",
        ExpressionAttributeValues: {
          ":f": { ...existingFlags, ...flags },
          ":u": now,
        },
      })
    );
  }

  return { plan: planId, status: planId === "trial" ? "trial" : "active", currentPeriodEnd: periodEnd };
}

export async function cancelBillingSubscription(auth: AuthContext, config: CoreConfig) {
  assertOwner(auth);
  const profile = await getProfile(auth.tenantId, config);
  const plan = profile.plan as TenantPlan;

  if (plan === "trial") {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Trial accounts expire automatically — upgrade to continue", 400);
  }
  if (profile.status !== "active") {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Only active subscriptions can be cancelled", 400);
  }
  if (profile.cancelAtPeriodEnd) {
    return ok({ cancelAtPeriodEnd: true, currentPeriodEnd: profile.billingPeriodEnd ?? null });
  }

  const now = new Date().toISOString();
  const db = getDocClient(config);
  await db.send(
    new UpdateCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(auth.tenantId), SK: Keys.profile() },
      UpdateExpression: "SET cancelAtPeriodEnd = :c, updatedAt = :u",
      ExpressionAttributeValues: { ":c": true, ":u": now },
    })
  );

  return ok({
    cancelAtPeriodEnd: true,
    currentPeriodEnd: (profile.billingPeriodEnd as string | undefined) ?? null,
  });
}

export async function reactivateBillingSubscription(auth: AuthContext, config: CoreConfig) {
  assertOwner(auth);
  const profile = await getProfile(auth.tenantId, config);

  if (!profile.cancelAtPeriodEnd) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Subscription is not scheduled for cancellation", 400);
  }

  const now = new Date().toISOString();
  const db = getDocClient(config);
  await db.send(
    new UpdateCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(auth.tenantId), SK: Keys.profile() },
      UpdateExpression: "SET cancelAtPeriodEnd = :c, updatedAt = :u",
      ExpressionAttributeValues: { ":c": false, ":u": now },
    })
  );

  return ok({ cancelAtPeriodEnd: false });
}

async function getCheckoutRecord(checkoutId: string, config: CoreConfig) {
  const db = getDocClient(config);
  const res = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.checkoutPk(checkoutId), SK: Keys.checkoutMeta() },
    })
  );
  return res.Item ?? null;
}

export async function createBillingCheckout(
  auth: AuthContext,
  body: { plan: TenantPlan; successUrl?: string; cancelUrl?: string },
  config: CoreConfig
) {
  assertOwner(auth);

  const targetPlan = body.plan;
  const plan = getBillingPlan(targetPlan);
  if (!plan) throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Unknown plan", 400);
  if (plan.contactSales || targetPlan === "trial") {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Plan is not available for self-serve checkout", 400);
  }
  if (plan.priceLkr <= 0) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Plan has no price", 400);
  }

  const profile = await getProfile(auth.tenantId, config);
  const currentPlan = profile.plan as TenantPlan;
  if (!isPlanUpgrade(currentPlan, targetPlan) && currentPlan !== targetPlan) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Only plan upgrades are supported via checkout", 400);
  }
  if (currentPlan === targetPlan && profile.status === "active") {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Already on this plan", 400);
  }

  const checkoutId = generateId("chk");
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + CHECKOUT_TTL_SEC * 1000).toISOString();
  const successUrl = body.successUrl ?? `${config.appUrl.replace(/\/$/, "")}/billing?checkout=success`;
  const cancelUrl = body.cancelUrl ?? `${config.appUrl.replace(/\/$/, "")}/billing?checkout=cancelled`;

  const session = {
    checkoutId,
    tenantId: auth.tenantId,
    plan: targetPlan,
    amountLkr: plan.priceLkr,
    currency: "LKR" as const,
    status: "pending" as const,
    successUrl,
    cancelUrl,
    createdAt: now,
    expiresAt,
  };

  const db = getDocClient(config);
  await db.send(
    new PutCommand({
      TableName: config.tableName,
      Item: {
        PK: Keys.checkoutPk(checkoutId),
        SK: Keys.checkoutMeta(),
        ...session,
        ttl: Math.floor(Date.now() / 1000) + CHECKOUT_TTL_SEC,
      },
    })
  );

  await db.send(
    new PutCommand({
      TableName: config.tableName,
      Item: {
        PK: Keys.tenantPk(auth.tenantId),
        SK: Keys.checkout(checkoutId),
        ...session,
      },
    })
  );

  const redirectUrl = buildGatewayRedirectUrl(config, {
    checkoutId,
    plan: targetPlan,
    amountLkr: plan.priceLkr,
    tenantId: auth.tenantId,
    successUrl,
    cancelUrl,
  });

  if (config.billingSkipPayment) {
    await confirmBillingCheckout(checkoutId, { status: "paid", transactionId: "dev-skip" }, config);
    return ok({
      ...session,
      status: "paid",
      redirectUrl: successUrl,
      gateway: "dev_skip",
      message: "Plan activated (BILLING_SKIP_PAYMENT=true)",
    });
  }

  return ok({
    ...session,
    redirectUrl,
    gateway: redirectUrl ? "external" : "pending",
    message: redirectUrl
      ? "Redirect customer to payment gateway"
      : "Payment gateway URL not configured — complete payment via webhook when integrated",
  });
}

export async function confirmBillingCheckout(
  checkoutId: string,
  payload: { status: "paid" | "failed"; transactionId?: string },
  config: CoreConfig
) {
  const record = await getCheckoutRecord(checkoutId, config);
  if (!record) throw new ApiError(ErrorCodes.NOT_FOUND, "Checkout not found", 404);
  if (record.status === "paid") {
    return ok({ checkoutId, status: "paid", plan: record.plan });
  }
  if (record.status !== "pending") {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Checkout is no longer pending", 400);
  }
  if (new Date(record.expiresAt as string).getTime() < Date.now()) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Checkout expired", 400);
  }

  const now = new Date().toISOString();
  const db = getDocClient(config);

  if (payload.status === "failed") {
    await db.send(
      new UpdateCommand({
        TableName: config.tableName,
        Key: { PK: Keys.checkoutPk(checkoutId), SK: Keys.checkoutMeta() },
        UpdateExpression: "SET #status = :s, failedAt = :u, transactionId = :t",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":s": "failed",
          ":u": now,
          ":t": payload.transactionId ?? null,
        },
      })
    );
    return ok({ checkoutId, status: "failed" });
  }

  const applied = await applyPlanToTenant(record.tenantId as string, record.plan as TenantPlan, config);

  await db.send(
    new UpdateCommand({
      TableName: config.tableName,
      Key: { PK: Keys.checkoutPk(checkoutId), SK: Keys.checkoutMeta() },
      UpdateExpression: "SET #status = :s, paidAt = :u, transactionId = :t",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":s": "paid",
        ":u": now,
        ":t": payload.transactionId ?? null,
      },
    })
  );

  return ok({ checkoutId, status: "paid", plan: applied.plan, currentPeriodEnd: applied.currentPeriodEnd });
}

export function verifyPaymentWebhookSecret(headerValue: string | null | undefined, config: CoreConfig) {
  const secret = config.paymentWebhookSecret;
  if (!secret) {
    throw new ApiError(ErrorCodes.FORBIDDEN, "Payment webhook not configured", 403);
  }
  if (!headerValue) {
    throw new ApiError(ErrorCodes.UNAUTHORIZED, "Missing payment webhook secret", 401);
  }
  const a = createHash("sha256").update(headerValue).digest();
  const b = createHash("sha256").update(secret).digest();
  if (a.length !== b.length || !a.equals(b)) {
    throw new ApiError(ErrorCodes.UNAUTHORIZED, "Invalid payment webhook secret", 401);
  }
}
