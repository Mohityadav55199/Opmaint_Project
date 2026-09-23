import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { DashboardQuerySchema } from "@/lib/permit-schemas";
import { getDashboard } from "@/lib/permit-service";

// ---- GET /api/dashboard — Dashboard data with filters and summary ----
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireAuthenticatedUser(request);

    const { searchParams } = new URL(request.url);
    const rawQuery = Object.fromEntries(searchParams.entries());
    const query = DashboardQuerySchema.parse(rawQuery);

    const dashboard = await getDashboard(actor, query);

    return NextResponse.json({ data: dashboard });
  } catch (error) {
    return handleApiError(error);
  }
}
