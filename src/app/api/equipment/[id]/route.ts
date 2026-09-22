import { z } from "zod";
import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { requireAuthenticatedUser } from "../../../../lib/auth";
import {
  handleApiError,
  ForbiddenError,
  NotFoundError,
} from "../../../../lib/errors";

const VALID_CRITICALITY = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

const PatchEquipmentSchema = z
  .object({
    name: z.string().trim().min(1).max(128).optional(),
    criticality: z.enum(VALID_CRITICALITY).optional(),
  })
  .refine((d) => d.name !== undefined || d.criticality !== undefined, {
    message: "At least one of name or criticality must be provided.",
  });

type Params = { params: Promise<{ id: string }> };

// ---- GET /api/equipment/:id ----
export async function GET(
  request: Request,
  { params }: Params
): Promise<NextResponse> {
  try {
    await requireAuthenticatedUser(request);

    const { id } = await params;

    const equipment = await prisma.equipment.findUnique({
      where: { id },
      select: {
        id: true,
        areaId: true,
        tagNumber: true,
        name: true,
        criticality: true,
        createdAt: true,
        updatedAt: true,
        area: {
          select: {
            id: true,
            code: true,
            name: true,
            plantId: true,
            plant: { select: { id: true, code: true, name: true, timezone: true } },
            owner: { select: { id: true, name: true, email: true, role: true } },
          },
        },
      },
    });

    if (!equipment) {
      throw new NotFoundError("Equipment not found.");
    }

    return NextResponse.json({ data: equipment });
  } catch (error) {
    return handleApiError(error);
  }
}

// ---- PATCH /api/equipment/:id — ADMIN only ----
export async function PATCH(
  request: Request,
  { params }: Params
): Promise<NextResponse> {
  try {
    const actor = await requireAuthenticatedUser(request);

    if (actor.role !== "ADMIN") {
      throw new ForbiddenError("Only ADMIN users may update equipment.");
    }

    const { id } = await params;

    const existing = await prisma.equipment.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundError("Equipment not found.");
    }

    const rawBody = await request.json().catch(() => null);
    const body = PatchEquipmentSchema.parse(rawBody);

    const updated = await prisma.equipment.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.criticality !== undefined && { criticality: body.criticality }),
      },
      select: {
        id: true,
        areaId: true,
        tagNumber: true,
        name: true,
        criticality: true,
        createdAt: true,
        updatedAt: true,
        area: {
          select: {
            id: true,
            code: true,
            name: true,
            plantId: true,
            plant: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
