import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { generateId } from "@commercechat/shared";
import type { CoreConfig } from "../config";
import { getDocClient } from "../db/client";
import { Keys } from "../db/keys";

export interface ChatTraceStage {
  name: string;
  durationMs: number;
  ok: boolean;
  meta?: Record<string, unknown>;
}

export interface ChatTraceSnapshot extends Record<string, unknown> {
  traceId: string;
  startedAt: string;
  totalMs: number;
  stages: ChatTraceStage[];
  marks: Record<string, unknown>;
}

export class ChatTurnTrace {
  readonly traceId = generateId("trace_");
  readonly startedAt = new Date().toISOString();
  private readonly startMs = Date.now();
  private stages: ChatTraceStage[] = [];
  private marks: Record<string, unknown> = {};

  constructor(private readonly base: { tenantId: string; channel: string; externalUserId?: string; messagePreview?: string }) {}

  mark(key: string, value: unknown) {
    this.marks[key] = value;
  }

  record(name: string, durationMs: number, ok = true, meta?: Record<string, unknown>) {
    this.stages.push({ name, durationMs, ok, ...(meta ? { meta } : {}) });
  }

  async time<T>(name: string, fn: () => Promise<T>, meta?: Record<string, unknown>): Promise<T> {
    const start = Date.now();
    try {
      const value = await fn();
      this.stages.push({ name, durationMs: Date.now() - start, ok: true, ...(meta ? { meta } : {}) });
      return value;
    } catch (err) {
      this.stages.push({
        name,
        durationMs: Date.now() - start,
        ok: false,
        meta: {
          ...meta,
          error: err instanceof Error ? err.message : String(err),
        },
      });
      throw err;
    }
  }

  snapshot(): ChatTraceSnapshot {
    return {
      traceId: this.traceId,
      startedAt: this.startedAt,
      totalMs: Date.now() - this.startMs,
      stages: this.stages,
      marks: this.marks,
    };
  }

  async persist(input: {
    conversationId: string;
    config: CoreConfig;
    intent?: string;
    subIntent?: string;
    funnelStage?: string;
    handledBy?: string;
  }) {
    const snapshot = this.snapshot();
    const db = getDocClient(input.config);
    const ttl = Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60;
    const item = {
      PK: Keys.tenantPk(this.base.tenantId),
      SK: Keys.chatTrace(input.conversationId, snapshot.startedAt, snapshot.traceId),
      ...this.base,
      ...snapshot,
      conversationId: input.conversationId,
      intent: input.intent,
      subIntent: input.subIntent,
      funnelStage: input.funnelStage,
      handledBy: input.handledBy,
      ttl,
    };
    await db.send(new PutCommand({ TableName: input.config.tableName, Item: item }));
    console.log("[chat-trace]", {
      tenantId: this.base.tenantId,
      conversationId: input.conversationId,
      traceId: snapshot.traceId,
      totalMs: snapshot.totalMs,
      stages: snapshot.stages.map((stage) => `${stage.name}:${stage.durationMs}${stage.ok ? "" : "!"}`).join(","),
    });
  }
}

export async function persistChatTraceSafely(
  trace: ChatTurnTrace,
  input: Parameters<ChatTurnTrace["persist"]>[0]
) {
  try {
    await trace.persist(input);
  } catch (err) {
    console.warn("[chat-trace] persist failed", err instanceof Error ? err.message : err);
  }
}
