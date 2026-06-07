import { createHttpApi } from "./http-client";

/**
 * All UI calls go through HTTP → local API server routes:
 * - Implemented Lambdas (auth, tenant) → real DynamoDB
 * - Everything else → mock fallback on server
 */
export const api = createHttpApi();

export const isHttpApi = true;
export const isMockApi = false;

export { REAL_API_DOMAINS, IMPLEMENTED_ROUTES } from "./implemented";
export type { ApiErrorShape } from "./http-client";
