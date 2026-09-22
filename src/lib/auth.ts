import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { AuthenticatedUser, Role } from "../domain/types";

const JWT_SECRET = process.env.JWT_SECRET || "opmaint-ptw-super-secret-jwt-key-for-signing-tokens-min-32-chars";
const secretKey = new TextEncoder().encode(JWT_SECRET);

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function signToken(user: AuthenticatedUser): Promise<string> {
  return new SignJWT({
    sub: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secretKey);
}

export async function verifyToken(token: string): Promise<AuthenticatedUser | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey);
    return {
      id: payload.sub as string,
      name: payload.name as string,
      email: payload.email as string,
      role: payload.role as Role,
    };
  } catch {
    return null;
  }
}
