import { ok } from "@commercechat/shared";
import { createHandler } from "../lib/handler";

export const handler = createHandler(async () =>
  ok({ status: "ok", version: "lambda-0.1.0", runtime: "aws-lambda" })
);
