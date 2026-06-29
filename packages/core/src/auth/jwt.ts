import { SignJWT, jwtVerify } from "jose";
import type { AuthContext, PlatformUserRole, UserRole } from "@commercechat/shared";
import type { CoreConfig } from "../config";

export interface AccessTokenClaims {
  sub: string;
  tid: string;
  role: UserRole;
  email: string;
  mfa: boolean;
  scope?: "tenant" | "platform";
  platformRole?: PlatformUserRole;
}

function secretKey(config: CoreConfig) {
  return new TextEncoder().encode(config.jwtSecret);
}

export async function signAccessToken(
  claims: AccessTokenClaims,
  config: CoreConfig
): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(config.jwtIssuer)
    .setExpirationTime(`${config.accessTokenTtlSec}s`)
    .setSubject(claims.sub)
    .sign(secretKey(config));
}

export async function verifyAccessToken(
  token: string,
  config: CoreConfig
): Promise<AccessTokenClaims> {
  const { payload } = await jwtVerify(token, secretKey(config), {
    issuer: config.jwtIssuer,
  });
  return {
    sub: payload.sub as string,
    tid: payload.tid as string,
    role: payload.role as UserRole,
    email: payload.email as string,
    mfa: Boolean(payload.mfa),
    scope: (payload.scope as "tenant" | "platform" | undefined) ?? "tenant",
    platformRole: payload.platformRole as PlatformUserRole | undefined,
  };
}

export function toAuthContext(claims: AccessTokenClaims): AuthContext {
  return {
    tenantId: claims.tid,
    userId: claims.sub,
    role: claims.role,
    email: claims.email,
    scope: claims.scope ?? "tenant",
    platformRole: claims.platformRole,
  };
}
