import type { SQSEvent, SQSHandler } from "aws-lambda";
import { loadConfig, runIngestJobByKind, type IngestJobKind } from "@commercechat/core";

type IngestPayload = {
  kind?: IngestJobKind;
  tenantId?: string;
  jobId?: string;
};

async function processPayload(body: IngestPayload, config: ReturnType<typeof loadConfig>) {
  if (!body.kind || !body.tenantId || !body.jobId) {
    console.warn("[ingest-worker] invalid payload", body);
    return;
  }
  await runIngestJobByKind(body.kind, body.tenantId, body.jobId, config);
}

export const handler: SQSHandler = async (event: SQSEvent | IngestPayload) => {
  const config = loadConfig();

  if ("Records" in event && Array.isArray(event.Records)) {
    for (const record of event.Records) {
      await processPayload(JSON.parse(record.body) as IngestPayload, config);
    }
    return;
  }

  await processPayload(event as IngestPayload, config);
};
