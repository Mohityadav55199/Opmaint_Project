import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, AUTH_COOKIE_OPTIONS } from "../../../../lib/auth";

export async function POST(): Promise<NextResponse> {
  const response = NextResponse.json({
    success: true,
    message: "Logged out successfully",
  });

  // Expire/clear session cookie
  response.cookies.set(AUTH_COOKIE_NAME, "", {
    ...AUTH_COOKIE_OPTIONS,
    maxAge: 0,
    expires: new Date(0),
  });

  return response;
}
