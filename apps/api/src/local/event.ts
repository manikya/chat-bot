import type { APIGatewayProxyEventV2 } from "aws-lambda";

export function toApigwEvent(
  req: Request,
  bodyText?: string,
  pathParameters?: Record<string, string>,
  isBase64Encoded = false
): APIGatewayProxyEventV2 {
  const url = new URL(req.url);
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => {
    headers[k] = v;
  });
  const queryStringParameters: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    queryStringParameters[k] = v;
  });

  return {
    version: "2.0",
    routeKey: "$default",
    rawPath: url.pathname,
    rawQueryString: url.search.slice(1),
    queryStringParameters: Object.keys(queryStringParameters).length ? queryStringParameters : undefined,
    headers,
    requestContext: {
      accountId: "local",
      apiId: "local",
      domainName: "localhost",
      domainPrefix: "local",
      http: {
        method: req.method,
        path: url.pathname,
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: req.headers.get("user-agent") ?? "",
      },
      requestId: crypto.randomUUID(),
      routeKey: "$default",
      stage: "$default",
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
    },
    body: bodyText,
    isBase64Encoded,
    pathParameters,
  };
}
