import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import type { CoreConfig } from "../config";
import type { IngestJobKind } from "./run-job";

export interface IngestJobMessage {
  kind: IngestJobKind;
  tenantId: string;
  jobId: string;
}

export async function dispatchIngestJob(
  kind: IngestJobKind,
  tenantId: string,
  jobId: string,
  config: CoreConfig
): Promise<boolean> {
  const payload: IngestJobMessage = { kind, tenantId, jobId };

  if (config.ingestStateMachineArn) {
    const sfn = new SFNClient({ region: config.awsRegion });
    await sfn.send(
      new StartExecutionCommand({
        stateMachineArn: config.ingestStateMachineArn,
        input: JSON.stringify(payload),
      })
    );
    return true;
  }

  if (config.ingestQueueUrl) {
    const sqs = new SQSClient({ region: config.awsRegion });
    await sqs.send(
      new SendMessageCommand({
        QueueUrl: config.ingestQueueUrl,
        MessageBody: JSON.stringify(payload),
      })
    );
    return true;
  }

  return false;
}
