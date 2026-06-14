import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from "aws-lambda";
import {
  loadConfig,
  verifyMetaWebhookChallenge,
  verifyMetaWebhookSignature,
  parseWhatsAppWebhookPayload,
  parseMessengerWebhookPayload,
  parseInstagramWebhookPayload,
  processWhatsAppInbound,
  processMessengerInbound,
  processMessengerEcho,
  processInstagramInbound,
} from "@commercechat/core";
import { queryParam } from "../lib/apigw";

function rawBody(event: APIGatewayProxyEventV2): string {
  if (!event.body) return "";
  return event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
}

export async function handler(
  event: APIGatewayProxyEventV2,
  _context: Context
): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext.http.method;
  const config = loadConfig();

  if (method === "GET") {
    const challenge = verifyMetaWebhookChallenge(
      config,
      queryParam(event, "hub.mode"),
      queryParam(event, "hub.verify_token"),
      queryParam(event, "hub.challenge")
    );
    if (challenge) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
        body: challenge,
      };
    }
    return { statusCode: 403, headers: { "Content-Type": "text/plain" }, body: "Forbidden" };
  }

  if (method === "POST") {
    const body = rawBody(event);
    const signature =
      event.headers?.["x-hub-signature-256"] ?? event.headers?.["X-Hub-Signature-256"];

    if (!verifyMetaWebhookSignature(body, signature, config.metaAppSecret)) {
      console.warn("[webhook-meta] invalid signature");
      return { statusCode: 403, body: JSON.stringify({ success: false, error: "Invalid signature" }) };
    }

    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      return { statusCode: 400, body: JSON.stringify({ success: false, error: "Invalid JSON" }) };
    }

    const waMessages = parseWhatsAppWebhookPayload(payload);
    for (const msg of waMessages) {
      void processWhatsAppInbound(msg, config).catch((err) => {
        console.error("[webhook-meta] whatsapp process error:", err instanceof Error ? err.message : err);
      });
    }

    const messengerMessages = parseMessengerWebhookPayload(payload);
    for (const msg of messengerMessages) {
      if (msg.isEcho) {
        void processMessengerEcho(msg, config).catch((err) => {
          console.error("[webhook-meta] messenger echo error:", err instanceof Error ? err.message : err);
        });
      } else {
        void processMessengerInbound(msg, config).catch((err) => {
          console.error("[webhook-meta] messenger process error:", err instanceof Error ? err.message : err);
        });
      }
    }

    const instagramMessages = parseInstagramWebhookPayload(payload);
    for (const msg of instagramMessages) {
      void processInstagramInbound(msg, config).catch((err) => {
        console.error("[webhook-meta] instagram process error:", err instanceof Error ? err.message : err);
      });
    }

    if (waMessages.length === 0 && messengerMessages.length === 0 && instagramMessages.length === 0) {
      console.log("[webhook-meta] non-message event received");
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true }),
    };
  }

  return { statusCode: 405, body: "Method Not Allowed" };
}
