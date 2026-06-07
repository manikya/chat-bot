import { normalizeEmail } from "@commercechat/shared";

export const Keys = {
  tenantPk: (tenantId: string) => `TENANT#${tenantId}`,
  profile: () => "PROFILE",
  config: () => "CONFIG",
  limits: () => "LIMITS",
  user: (userId: string) => `USER#${userId}`,
  session: (sessionId: string) => `SESSION#${sessionId}`,
  emailLookupPk: (email: string) => `EMAIL#${normalizeEmail(email)}`,
  emailLookupSk: () => "USER",
  tokenPk: (hash: string) => `TOKEN#${hash}`,
  tokenSk: () => "META",
  refreshLookupPk: (hash: string) => `REFRESH#${hash}`,
  refreshLookupSk: () => "SESSION",
  apiKeyPk: (hash: string) => `APIKEY#${hash}`,
  apiKeySk: () => "TENANT",
};
