import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "../../../../lib/auth";
import { handleApiError } from "../../../../lib/errors";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const user = await requireAuthenticatedUser(request);

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
