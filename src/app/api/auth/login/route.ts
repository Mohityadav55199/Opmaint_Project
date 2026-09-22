import { z } from "zod";
import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import {
  verifyPassword,
  signToken,
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_OPTIONS,
} from "../../../../lib/auth";
import {
  handleApiError,
  UnauthorizedError,
  ForbiddenError,
} from "../../../../lib/errors";

const LoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const rawBody = await request.json().catch(() => null);
    const body = LoginSchema.parse(rawBody);

    const email = body.email.toLowerCase().trim();
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        passwordHash: true,
        role: true,
        isActive: true,
      },
    });

    // Timing-resistant generic error for unknown user
    if (!user) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const isValidPassword = await verifyPassword(body.password, user.passwordHash);
    if (!isValidPassword) {
      throw new UnauthorizedError("Invalid email or password");
    }

    // Reject deactivated users
    if (!user.isActive) {
      throw new ForbiddenError("Account is deactivated. Please contact an administrator.");
    }

    // Issue JWT with minimal identity claim (sub only)
    const token = await signToken({ id: user.id });

    // Build safe response (no passwordHash or secrets)
    const response = NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });

    // Set secure HTTP-only session cookie
    response.cookies.set(AUTH_COOKIE_NAME, token, AUTH_COOKIE_OPTIONS);

    return response;
  } catch (error) {
    return handleApiError(error);
  }
}
