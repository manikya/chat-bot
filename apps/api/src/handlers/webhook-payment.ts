import { confirmBillingCheckout, loadConfig, verifyPaymentWebhookSecret } from "@commercechat/core";
import { ApiError, ErrorCodes } from "@commercechat/shared";
import { createHandler } from "../lib/handler";
import { parseBody } from "../lib/apigw";

export const handler = createHandler(async (event) => {
  const config = loadConfig();
  const secret =
    event.headers?.["x-payment-secret"] ??
    event.headers?.["X-Payment-Secret"] ??
    event.headers?.["x-webhook-secret"] ??
    event.headers?.["X-Webhook-Secret"];
  verifyPaymentWebhookSecret(secret, config);

  const body = parseBody<{
    checkoutId: string;
    status: "paid" | "failed";
    transactionId?: string;
  }>(event);

  if (!body.checkoutId || !body.status) {
    throw new ApiError(ErrorCodes.VALIDATION_ERROR, "checkoutId and status are required", 400);
  }

  return confirmBillingCheckout(body.checkoutId, body, config);
});
