import { SignJWT, jwtVerify } from "jose";
import type { AuthContext, UserRole } from "@commercechat/shared";
import type { CoreConfig } from "../config";

export interface AccessTokenClaims {
  sub: string;
  tid: string;
  role: UserRole;
  email: string;
  mfa: boolean;
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
  };
}

export function toAuthContext(claims: AccessTokenClaims): AuthContext {
  return {
    tenantId: claims.tid,
    userId: claims.sub,
    role: claims.role,
    email: claims.email,
  };
}
