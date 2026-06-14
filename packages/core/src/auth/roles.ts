import { ApiError, ErrorCodes, type AuthContext } from "@commercechat/shared";

export type UserRole = "owner" | "admin" | "viewer";

const ROLE_RANK: Record<UserRole, number> = {
  viewer: 0,
  admin: 1,
  owner: 2,
};

export function assertMinRole(auth: AuthContext, minRole: "admin" | "owner") {
  const rank = ROLE_RANK[(auth.role as UserRole) ?? "viewer"] ?? 0;
  if (rank < ROLE_RANK[minRole]) {
    throw new ApiError(ErrorCodes.FORBIDDEN, "Insufficient permissions", 403);
  }
}

export function assertNotViewer(auth: AuthContext) {
  if (auth.role === "viewer") {
    throw new ApiError(ErrorCodes.FORBIDDEN, "Insufficient permissions", 403);
  }
}

export function assertOwner(auth: AuthContext) {
  if (auth.role !== "owner") {
    throw new ApiError(ErrorCodes.FORBIDDEN, "Owner access required", 403);
  }
}
