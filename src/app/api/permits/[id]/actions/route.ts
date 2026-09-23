import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import { handleApiError, BadRequestError } from "@/lib/errors";
import { getAvailableActions } from "@/lib/permit-service";

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
  const actionsIdx = segments.indexOf("actions");
  if (actionsIdx > 0) return segments[actionsIdx - 1];
  const permitIdx = segments.indexOf("permits");
  if (permitIdx >= 0 && segments.length > permitIdx + 1) {
    return segments[permitIdx + 1];
  }
  return segments[segments.length - 1] || "";
}

// ---- GET /api/permits/:id/actions — Available domain actions for caller ----
export async function GET(
  request: Request,
  context?: RouteContext
): Promise<NextResponse> {
  try {
    const actor = await requireAuthenticatedUser(request);
    const id = await extractId(request, context);
    if (!id) throw new BadRequestError("Permit ID not provided in URL.");

    const actions = await getAvailableActions(actor, id);
    return NextResponse.json({ data: actions });
  } catch (error) {
    return handleApiError(error);
  }
}
