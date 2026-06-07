/** Routes backed by real Lambda handlers + DynamoDB */
export const IMPLEMENTED_ROUTES = [
  "GET /health",
  "POST /auth/signup",
  "POST /auth/login",
  "POST /auth/refresh",
  "POST /auth/logout",
  "POST /auth/forgot-password",
  "POST /auth/reset-password",
  "POST /auth/resend-verification",
  "GET /auth/me",
  "POST /auth/verify-email",
  "GET /api/v1/tenants/me",
  "PATCH /api/v1/tenants/me",
  "GET /api/v1/tenants/me/config",
  "PATCH /api/v1/tenants/me/config",
  "GET /api/v1/tenants/me/limits",
] as const;

export const REAL_API_DOMAINS = ["auth", "tenant profile", "tenant config", "plan limits"] as const;
