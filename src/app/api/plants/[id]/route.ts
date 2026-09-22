import { z } from "zod";
import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { requireAuthenticatedUser } from "../../../../lib/auth";
import {
  handleApiError,
  ForbiddenError,
  NotFoundError,
} from "../../../../lib/errors";

// ---- Validation schema ----
const PatchPlantSchema = z
  .object({
    name: z.string().trim().min(1).max(128).optional(),
    timezone: z.string().trim().min(1).max(64).optional(),
  })
  .refine((d) => d.name !== undefined || d.timezone !== undefined, {
    message: "At least one of name or timezone must be provided.",
  });

type Params = { params: Promise<{ id: string }> };

// ---- GET /api/plants/:id ----
export async function GET(
  request: Request,
  { params }: Params
): Promise<NextResponse> {
  try {
    await requireAuthenticatedUser(request);

    const { id } = await params;

    const plant = await prisma.plant.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        name: true,
        timezone: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!plant) {
      throw new NotFoundError("Plant not found.");
    }

    return NextResponse.json({ data: plant });
  } catch (error) {
    return handleApiError(error);
  }
}

// ---- PATCH /api/plants/:id — ADMIN only ----
export async function PATCH(
  request: Request,
  { params }: Params
): Promise<NextResponse> {
  try {
    const actor = await requireAuthenticatedUser(request);

    if (actor.role !== "ADMIN") {
      throw new ForbiddenError("Only ADMIN users may update plants.");
    }

    const { id } = await params;

    // Existence check
    const existing = await prisma.plant.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundError("Plant not found.");
    }

    const rawBody = await request.json().catch(() => null);
    const body = PatchPlantSchema.parse(rawBody);

    const updated = await prisma.plant.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.timezone !== undefined && { timezone: body.timezone }),
      },
      select: {
        id: true,
        code: true,
        name: true,
        timezone: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
