import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { CoreConfig } from "../config";

let docClient: DynamoDBDocumentClient | null = null;

export function getDocClient(config: CoreConfig): DynamoDBDocumentClient {
  if (!docClient) {
    const client = new DynamoDBClient({
      region: config.awsRegion,
      ...(config.dynamoEndpoint
        ? { endpoint: config.dynamoEndpoint, credentials: { accessKeyId: "test", secretAccessKey: "test" } }
        : {}),
    });
    docClient = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return docClient;
}
