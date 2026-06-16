import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from "aws-lambda";

export function isScheduledEvent(event: unknown): boolean {
  return (
    typeof event === "object" &&
    event !== null &&
    (event as { source?: string }).source === "aws.events"
  );
}

export function wrapCronHandler(
  run: () => Promise<unknown>,
  httpHandler: (
    event: APIGatewayProxyEventV2,
    context: Context
  ) => Promise<APIGatewayProxyResultV2>
) {
  return async (
    event: APIGatewayProxyEventV2 | { source: string },
    context: Context
  ): Promise<APIGatewayProxyResultV2> => {
    if (isScheduledEvent(event)) {
      await run();
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }
    return httpHandler(event as APIGatewayProxyEventV2, context);
  };
}
