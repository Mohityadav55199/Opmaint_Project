import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import { handleApiError, BadRequestError } from "@/lib/errors";
import { CreatePermitSchema, ListPermitsQuerySchema } from "@/lib/permit-schemas";
import { createDraft, listPermits } from "@/lib/permit-service";

// ---- GET /api/permits — list with optional filters ----
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireAuthenticatedUser(request);

    const { searchParams } = new URL(request.url);
    const rawQuery = Object.fromEntries(searchParams.entries());
    const query = ListPermitsQuerySchema.parse(rawQuery);

    const result = await listPermits(actor, query);

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

// ---- POST /api/permits — create DRAFT ----
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireAuthenticatedUser(request);

    const rawBody = await request.json().catch(() => null);

    // Explicitly detect and reject banned client-supplied fields before parsing
    if (rawBody && typeof rawBody === "object") {
      const banned = ["requesterId", "status", "permitNumber", "expiresAt", "plantId", "areaId"];
      for (const field of banned) {
        if (field in rawBody) {
          throw new BadRequestError(
            `Field "${field}" cannot be set by the client and must not be included in the request.`
          );
        }
      }
    }

    const input = CreatePermitSchema.parse(rawBody);

    const permit = await createDraft(actor, input);

    return NextResponse.json({ data: permit }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
