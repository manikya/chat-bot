import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { corsHeaders } from "../lib/apigw";

declare const __WIDGET_V1_JS__: string;

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  if (event.requestContext.http.method === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders() };
  }

  return {
    statusCode: 200,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
    body: __WIDGET_V1_JS__,
  };
};
