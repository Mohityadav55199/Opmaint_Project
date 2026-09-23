import { NextResponse } from "next/server";
import { reconcileExpiredPermits } from "@/lib/permit-service";

/**
 * Protected scheduled expiry sweep endpoint.
 *
 * Requirements:
 * - Must be protected by a shared secret (CRON_SECRET).
 * - Accepts Bearer token in Authorization header or x-cron-secret header.
 * - Reconciles all eligible permits whose validity window expired into EXPIRED status
 *   with authoritative SYSTEM actor audit logs.
 */
async function handleExpireSweep(request: Request): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { code: "FORBIDDEN", message: "CRON_SECRET is not configured on the server." },
      { status: 403 }
    );
  }

  const authHeader = request.headers.get("authorization");
  const xCronHeader = request.headers.get("x-cron-secret");

  const isBearerMatch = authHeader === `Bearer ${cronSecret}`;
  const isHeaderMatch = xCronHeader === cronSecret;

  if (!isBearerMatch && !isHeaderMatch) {
    return NextResponse.json(
      { code: "UNAUTHORIZED", message: "Invalid or missing cron secret." },
      { status: 401 }
    );
  }

  const expiredIds = await reconcileExpiredPermits(new Date(), 100);

  return NextResponse.json({
    success: true,
    message: `Reconciled ${expiredIds.length} expired permit(s).`,
    expiredCount: expiredIds.length,
    expiredIds,
    timestamp: new Date().toISOString(),
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  return handleExpireSweep(request);
}

export async function GET(request: Request): Promise<NextResponse> {
  return handleExpireSweep(request);
}
