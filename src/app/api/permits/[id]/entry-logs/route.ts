import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import { handleApiError, BadRequestError } from "@/lib/errors";
import { addEntryExitLog, listEntryExitLogs } from "@/lib/permit-service";
import { LogEntryExitSchema } from "@/lib/permit-schemas";

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
  const idx = segments.indexOf("entry-logs");
  if (idx > 0) return segments[idx - 1];
  const permitIdx = segments.indexOf("permits");
  if (permitIdx >= 0 && segments.length > permitIdx + 1) {
    return segments[permitIdx + 1];
  }
  return segments[segments.length - 1] || "";
}

export async function GET(
  request: Request,
  context?: RouteContext
): Promise<NextResponse> {
  try {
    await requireAuthenticatedUser(request);
    const id = await extractId(request, context);
    if (!id) {
      throw new BadRequestError("Permit ID not provided in URL.");
    }

    const result = await listEntryExitLogs(id);
    return NextResponse.json({ data: result }, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  request: Request,
  context?: RouteContext
): Promise<NextResponse> {
  try {
    const actor = await requireAuthenticatedUser(request);
    const id = await extractId(request, context);
    if (!id) {
      throw new BadRequestError("Permit ID not provided in URL.");
    }

    let payload: unknown = {};
    const text = await request.text();
    if (text.trim()) {
      try {
        payload = JSON.parse(text);
      } catch {
        throw new BadRequestError("Malformed JSON request body.");
      }
    }

    const input = LogEntryExitSchema.parse(payload);
    const entryExit = await addEntryExitLog(actor, id, input);

    return NextResponse.json({ data: entryExit }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
