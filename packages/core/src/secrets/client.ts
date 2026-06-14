import {
  CreateSecretCommand,
  DeleteSecretCommand,
  GetSecretValueCommand,
  PutSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import type { CoreConfig } from "../config";

export function getSecretsManagerClient(config: CoreConfig) {
  // LocalStack only — on Lambda/real AWS use the execution role (includes session token).
  if (config.secretsEndpoint) {
    return new SecretsManagerClient({
      region: config.awsRegion,
      endpoint: config.secretsEndpoint,
      credentials: {
        accessKeyId: config.secretsAccessKeyId ?? "test",
        secretAccessKey: config.secretsSecretAccessKey ?? "test",
      },
    });
  }
  return new SecretsManagerClient({ region: config.awsRegion });
}

export async function getJsonSecret<T>(
  config: CoreConfig,
  secretId: string
): Promise<T | null> {
  const client = getSecretsManagerClient(config);
  try {
    const res = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
    if (!res.SecretString) return null;
    return JSON.parse(res.SecretString) as T;
  } catch (err) {
    const e = err as { name?: string };
    if (e.name === "ResourceNotFoundException") return null;
    throw err;
  }
}

export async function putJsonSecret(
  config: CoreConfig,
  secretId: string,
  value: unknown
): Promise<void> {
  const client = getSecretsManagerClient(config);
  const body = JSON.stringify(value);
  try {
    await client.send(
      new PutSecretValueCommand({
        SecretId: secretId,
        SecretString: body,
      })
    );
  } catch (err) {
    const e = err as { name?: string };
    if (e.name !== "ResourceNotFoundException") throw err;
    await client.send(
      new CreateSecretCommand({
        Name: secretId,
        SecretString: body,
      })
    );
  }
}

export async function deleteSecret(config: CoreConfig, secretId: string): Promise<void> {
  const client = getSecretsManagerClient(config);
  try {
    await client.send(
      new DeleteSecretCommand({
        SecretId: secretId,
        ForceDeleteWithoutRecovery: true,
      })
    );
  } catch (err) {
    const e = err as { name?: string };
    if (e.name === "ResourceNotFoundException") return;
    throw err;
  }
}
