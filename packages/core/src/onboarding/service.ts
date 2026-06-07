import { GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import {
  ApiError,
  ErrorCodes,
  ok,
  type AdvanceOnboardingStepResult,
  type AuthContext,
  type OnboardingState,
  type OnboardingStep,
  type OnboardingTestChatResult,
} from "@commercechat/shared";
import type { CoreConfig } from "../config";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";
import { runChatOrchestrator } from "../chat/orchestrator";
import { countWebsiteSources } from "../knowledge/service";
import {
  ONBOARDING_STEP_ORDER,
  SKIPPABLE_STEPS,
  STEP_ESTIMATE_MINUTES,
  WIZARD_STEPS,
} from "./constants";

interface OnboardingStateRecord {
  testMessageCount: number;
  skippedSteps: OnboardingStep[];
  stepCompletedAt: Partial<Record<OnboardingStep, string>>;
}

function defaultStateRecord(): OnboardingStateRecord {
  return { testMessageCount: 0, skippedSteps: [], stepCompletedAt: {} };
}

async function getProfileItem(auth: AuthContext, config: CoreConfig) {
  const db = getDocClient(config);
  const res = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(auth.tenantId), SK: Keys.profile() },
    })
  );
  if (!res.Item) throw new ApiError(ErrorCodes.NOT_FOUND, "Tenant not found", 404);
  return res.Item;
}

async function getOnboardingRecord(auth: AuthContext, config: CoreConfig): Promise<OnboardingStateRecord> {
  const db = getDocClient(config);
  const res = await db.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(auth.tenantId), SK: Keys.onboardingState() },
    })
  );
  if (!res.Item) return defaultStateRecord();
  return {
    testMessageCount: Number(res.Item.testMessageCount ?? 0),
    skippedSteps: (res.Item.skippedSteps as OnboardingStep[]) ?? [],
    stepCompletedAt: (res.Item.stepCompletedAt as OnboardingStateRecord["stepCompletedAt"]) ?? {},
  };
}

async function saveOnboardingRecord(
  auth: AuthContext,
  record: OnboardingStateRecord,
  config: CoreConfig
) {
  const db = getDocClient(config);
  await db.send(
    new PutCommand({
      TableName: config.tableName,
      Item: {
        PK: Keys.tenantPk(auth.tenantId),
        SK: Keys.onboardingState(),
        ...record,
        updatedAt: new Date().toISOString(),
      },
    })
  );
}

function stepIndex(step: OnboardingStep) {
  return ONBOARDING_STEP_ORDER.indexOf(step);
}

async function buildStepMetadata(
  step: OnboardingStep,
  auth: AuthContext,
  config: CoreConfig
): Promise<Record<string, unknown> | undefined> {
  if (step === "knowledge") {
    const websiteCount = await countWebsiteSources(auth, config);
    if (websiteCount > 0) {
      return { websiteSourceCount: websiteCount };
    }
  }
  if (step === "channels") {
    return { whatsappConnected: false };
  }
  return undefined;
}

async function buildSteps(
  currentStep: OnboardingStep,
  record: OnboardingStateRecord,
  auth: AuthContext,
  config: CoreConfig
): Promise<OnboardingState["steps"]> {
  const currentIdx = stepIndex(currentStep);
  const steps: OnboardingState["steps"] = [];

  for (const step of WIZARD_STEPS) {
    const idx = stepIndex(step);
    let status: OnboardingState["steps"][number]["status"] = "pending";
    if (currentStep === "complete" || idx < currentIdx) status = "completed";
    else if (step === currentStep) status = "in_progress";

    const entry: OnboardingState["steps"][number] = {
      step,
      status,
      ...(record.stepCompletedAt[step] ? { completedAt: record.stepCompletedAt[step] } : {}),
    };
    if (status === "in_progress" || status === "completed") {
      const metadata = await buildStepMetadata(step, auth, config);
      if (metadata) entry.metadata = metadata;
    }
    steps.push(entry);
  }
  return steps;
}

function estimateMinutesRemaining(currentStep: OnboardingStep): number {
  if (currentStep === "complete") return 0;
  const idx = stepIndex(currentStep);
  return WIZARD_STEPS.filter((s) => stepIndex(s) >= idx).reduce(
    (sum, s) => sum + STEP_ESTIMATE_MINUTES[s],
    0
  );
}

export async function getOnboardingState(auth: AuthContext, config: CoreConfig) {
  const profile = await getProfileItem(auth, config);
  const record = await getOnboardingRecord(auth, config);
  const currentStep = (profile.onboardingStep as OnboardingStep) ?? "profile";

  return ok<OnboardingState>({
    currentStep,
    steps: await buildSteps(currentStep, record, auth, config),
    canSkip: [...SKIPPABLE_STEPS],
    estimatedMinutesRemaining: estimateMinutesRemaining(currentStep),
  });
}

async function validateAdvance(
  auth: AuthContext,
  targetStep: OnboardingStep,
  previousStep: OnboardingStep,
  body: { skipped?: boolean; skippedSteps?: OnboardingStep[] },
  profile: Record<string, unknown>,
  record: OnboardingStateRecord,
  config: CoreConfig
) {
  const skipped = new Set([
    ...record.skippedSteps,
    ...(body.skippedSteps ?? []),
    ...(body.skipped ? [previousStep] : []),
  ]);

  if (targetStep === "channels") {
    if (!profile.storeName || !profile.timezone) {
      throw new ApiError(
        ErrorCodes.ONBOARDING_INCOMPLETE,
        "Store name and timezone are required before connecting channels",
        400
      );
    }
  }

  if (targetStep === "catalog") {
    const hasWebsite = (await countWebsiteSources(auth, config)) > 0;
    const knowledgeSkipped = skipped.has("knowledge");
    if (!hasWebsite && !knowledgeSkipped) {
      throw new ApiError(
        ErrorCodes.ONBOARDING_INCOMPLETE,
        "Add a website source or skip the knowledge step",
        400
      );
    }
  }

  if (targetStep === "widget" && record.testMessageCount < 1) {
    throw new ApiError(
      ErrorCodes.ONBOARDING_INCOMPLETE,
      "Send at least one test message before continuing",
      400
    );
  }
}

export async function advanceOnboardingStep(
  auth: AuthContext,
  body: { step: OnboardingStep; skipped?: boolean; skippedSteps?: OnboardingStep[] },
  config: CoreConfig
) {
  if (auth.role !== "owner") {
    throw new ApiError(ErrorCodes.FORBIDDEN, "Only the owner can advance onboarding", 403);
  }

  const { step } = body;
  if (!ONBOARDING_STEP_ORDER.includes(step)) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Invalid onboarding step", 400);
  }

  const profile = await getProfileItem(auth, config);
  const previousStep = (profile.onboardingStep as OnboardingStep) ?? "profile";
  const record = await getOnboardingRecord(auth, config);

  await validateAdvance(auth, step, previousStep, body, profile, record, config);

  const now = new Date().toISOString();
  const skippedSteps = new Set(record.skippedSteps);
  if (body.skipped) skippedSteps.add(previousStep);
  for (const s of body.skippedSteps ?? []) skippedSteps.add(s);

  const stepCompletedAt = { ...record.stepCompletedAt };
  const nextIdx = stepIndex(step);
  for (const s of ONBOARDING_STEP_ORDER) {
    if (stepIndex(s) < nextIdx && !stepCompletedAt[s]) {
      stepCompletedAt[s] = now;
    }
  }
  if (step === "complete") {
    for (const s of WIZARD_STEPS) stepCompletedAt[s] = stepCompletedAt[s] ?? now;
  }

  const db = getDocClient(config);
  await db.send(
    new UpdateCommand({
      TableName: config.tableName,
      Key: { PK: Keys.tenantPk(auth.tenantId), SK: Keys.profile() },
      UpdateExpression: "SET #onboardingStep = :o, #updatedAt = :u",
      ExpressionAttributeNames: {
        "#onboardingStep": "onboardingStep",
        "#updatedAt": "updatedAt",
      },
      ExpressionAttributeValues: { ":o": step, ":u": now },
      ConditionExpression: "attribute_exists(PK)",
    })
  );

  await saveOnboardingRecord(
    auth,
    {
      testMessageCount: record.testMessageCount,
      skippedSteps: [...skippedSteps],
      stepCompletedAt,
    },
    config
  );

  return ok<AdvanceOnboardingStepResult>({
    previousStep,
    currentStep: step,
    onboardingStep: step,
  });
}

export async function onboardingTestChat(
  auth: AuthContext,
  message: string,
  config: CoreConfig
) {
  if (!message?.trim()) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "Message is required", 400);
  }

  const record = await getOnboardingRecord(auth, config);
  const testMessageCount = record.testMessageCount + 1;
  await saveOnboardingRecord(auth, { ...record, testMessageCount }, config);

  const chat = await runChatOrchestrator(
    auth,
    {
      channel: "test",
      externalUserId: `onboarding-${auth.userId}`,
      message: message.trim(),
    },
    config
  );

  return ok<OnboardingTestChatResult>({
    reply: chat.reply,
    testMessageCount,
    canAdvanceToWidget: testMessageCount >= 1,
  });
}
