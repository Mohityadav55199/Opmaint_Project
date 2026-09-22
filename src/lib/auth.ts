import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { AuthenticatedUser, Role } from "../domain/types";
import { prisma } from "./prisma";
import { UnauthorizedError } from "./errors";

const PUBLIC_EXAMPLE_SECRET = "opmaint-ptw-super-secret-jwt-key-for-signing-tokens-min-32-chars";
const TEST_JWT_SECRET = "test-only-jwt-secret-key-for-vitest-32-chars-long";

export const AUTH_COOKIE_NAME = "opmaint_token";

export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 8 * 60 * 60, // 8 hours in seconds
};

/**
 * Resolves the JWT secret safely.
 * - Outside of test environments, JWT_SECRET must be configured.
 * - Production fails if the public .env.example secret is used.
 */
export function getJwtSecret(customSecret?: string): Uint8Array {
  if (customSecret) {
    return new TextEncoder().encode(customSecret);
  }

  const envSecret = process.env.JWT_SECRET;

  if (process.env.NODE_ENV === "production") {
    if (!envSecret || envSecret === PUBLIC_EXAMPLE_SECRET) {
      throw new Error("FATAL SECURITY VIOLATION: Production requires a unique JWT_SECRET. The public fallback secret is prohibited.");
    }
    return new TextEncoder().encode(envSecret);
  }

  if (envSecret) {
    return new TextEncoder().encode(envSecret);
  }

  if (process.env.NODE_ENV === "test") {
    return new TextEncoder().encode(TEST_JWT_SECRET);
  }

  throw new Error("FATAL: JWT_SECRET environment variable is missing and must be configured.");
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Signs a JWT for a user session (8-hour expiration).
 * Contains ONLY minimal required identity information (sub = userId).
 * Role is NOT stored as a trusted authorization value.
 */
export async function signToken(
  user: { id: string; [key: string]: unknown },
  customSecret?: string
): Promise<string> {
  const secretKey = getJwtSecret(customSecret);

  return new SignJWT({
    sub: user.id,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secretKey);
}

/**
 * Verifies JWT signature and returns the raw payload if cryptographically valid.
 */
export async function verifyJwt(
  token: string,
  customSecret?: string
): Promise<{ sub: string; name?: string; email?: string; role?: string } | null> {
  try {
    const secretKey = getJwtSecret(customSecret);
    const { payload } = await jwtVerify(token, secretKey);
    return {
      sub: payload.sub as string,
      name: payload.name as string | undefined,
      email: payload.email as string | undefined,
      role: payload.role as string | undefined,
    };
  } catch {
    return null;
  }
}

export type UserDbLoader = (userId: string) => Promise<{
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
} | null>;

/**
 * Authenticates request by verifying JWT and loading the authoritative user from PostgreSQL.
 * NEVER trusts the role or active state claimed in the JWT payload.
 * Rejects inactive (deactivated) users immediately.
 */
export async function getAuthenticatedUser(
  token: string,
  customLoader?: UserDbLoader,
  customSecret?: string
): Promise<AuthenticatedUser | null> {
  const payload = await verifyJwt(token, customSecret);
  if (!payload || !payload.sub) {
    return null;
  }

  // Load authoritative user record from DB
  const user = customLoader
    ? await customLoader(payload.sub)
    : await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, name: true, email: true, role: true, isActive: true },
      });

  if (!user) {
    return null; // User deleted or nonexistent
  }

  // Security check: Deactivated users cannot authenticate or access endpoints
  if (user.isActive === false) {
    return null;
  }

  // Return authoritative DB user state
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
  };
}

/**
 * Parses HTTP Cookie header into key-value map.
 */
export function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  const cookies: Record<string, string> = {};
  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const [rawKey, ...valParts] = pair.trim().split("=");
    if (rawKey) {
      cookies[rawKey] = decodeURIComponent(valParts.join("="));
    }
  }
  return cookies;
}

/**
 * Extracts JWT token from incoming HTTP Request.
 * Prioritizes HTTP-only auth cookie, with Authorization: Bearer header fallback.
 */
export function extractTokenFromRequest(request: Request): string | null {
  // 1. Check Cookie header
  const cookieHeader = request.headers.get("cookie");
  const cookies = parseCookies(cookieHeader);
  if (cookies[AUTH_COOKIE_NAME]) {
    return cookies[AUTH_COOKIE_NAME];
  }

  // 2. Check NextRequest.cookies if available
  const nextReq = request as { cookies?: { get?: (name: string) => { value?: string } | undefined } };
  const cookieObj = nextReq.cookies?.get?.(AUTH_COOKIE_NAME);
  if (cookieObj?.value) {
    return cookieObj.value;
  }

  // 3. Fallback: Authorization Bearer header
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  return null;
}

/**
 * Authenticates an incoming HTTP request and returns the authoritative user from PostgreSQL.
 */
export async function getAuthenticatedUserFromRequest(
  request: Request,
  customLoader?: UserDbLoader,
  customSecret?: string
): Promise<AuthenticatedUser | null> {
  const token = extractTokenFromRequest(request);
  if (!token) {
    return null;
  }
  return getAuthenticatedUser(token, customLoader, customSecret);
}

/**
 * Requires an authenticated user for the incoming HTTP request.
 * Throws UnauthorizedError if token is missing, invalid, expired, or user is inactive.
 */
export async function requireAuthenticatedUser(
  request: Request,
  customLoader?: UserDbLoader,
  customSecret?: string
): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUserFromRequest(request, customLoader, customSecret);
  if (!user) {
    throw new UnauthorizedError("Authentication required. Please log in.");
  }
  return user;
}
