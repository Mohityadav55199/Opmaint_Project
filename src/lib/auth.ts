import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { AuthenticatedUser, Role } from "../domain/types";
import { prisma } from "./prisma";

const PUBLIC_EXAMPLE_SECRET = "opmaint-ptw-super-secret-jwt-key-for-signing-tokens-min-32-chars";
const TEST_JWT_SECRET = "test-only-jwt-secret-key-for-vitest-32-chars-long";

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
 */
export async function signToken(
  user: { id: string; name?: string; email?: string; role?: Role },
  customSecret?: string
): Promise<string> {
  const secretKey = getJwtSecret(customSecret);

  return new SignJWT({
    sub: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
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
