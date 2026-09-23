import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import { handleApiError, BadRequestError } from "@/lib/errors";
import { PatchPermitSchema } from "@/lib/permit-schemas";
import { getPermit, updateDraft } from "@/lib/permit-service";

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

async function extractId(request: Request, context?: RouteContext): Promise<string> {
  if (context?.params) {
    const resolved = await context.params;
    if (resolved?.id) return resolved.id;
  }
  const url = new URL(request.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const permitIdx = segments.indexOf("permits");
  if (permitIdx >= 0 && segments.length > permitIdx + 1) {
    return segments[permitIdx + 1];
  }
  return segments[segments.length - 1] || "";
}

// ---- GET /api/permits/:id ----
export async function GET(
  request: Request,
  context?: RouteContext
): Promise<NextResponse> {
  try {
    const actor = await requireAuthenticatedUser(request);
    const id = await extractId(request, context);
    if (!id) throw new BadRequestError("Permit ID not provided in URL.");

    const permit = await getPermit(id, actor);
    return NextResponse.json({ data: permit });
  } catch (error) {
    return handleApiError(error);
  }
}

// ---- PATCH /api/permits/:id ----
export async function PATCH(
  request: Request,
  context?: RouteContext
): Promise<NextResponse> {
  try {
    const actor = await requireAuthenticatedUser(request);
    const id = await extractId(request, context);
    if (!id) throw new BadRequestError("Permit ID not provided in URL.");

    const rawBody = await request.json().catch(() => null);
    // Reject banned fields – same logic as in base route
    if (rawBody && typeof rawBody === "object") {
      const banned = ["requesterId", "status", "permitNumber", "expiresAt", "plantId", "areaId"];
      for (const field of banned) {
        if (field in rawBody) {
          throw new BadRequestError(`Field "${field}" cannot be set by the client and must not be included in the request.`);
        }
      }
    }

    const input = PatchPermitSchema.parse(rawBody);
    const updated = await updateDraft(actor, id, input);
    return NextResponse.json({ data: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
