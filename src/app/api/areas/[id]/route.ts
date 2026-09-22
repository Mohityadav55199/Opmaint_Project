import { z } from "zod";
import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { requireAuthenticatedUser } from "../../../../lib/auth";
import {
  handleApiError,
  ForbiddenError,
  NotFoundError,
  BadRequestError,
} from "../../../../lib/errors";

const PatchAreaSchema = z
  .object({
    name: z.string().trim().min(1).max(128).optional(),
    ownerId: z.string().min(1).optional(),
  })
  .refine((d) => d.name !== undefined || d.ownerId !== undefined, {
    message: "At least one of name or ownerId must be provided.",
  });

type Params = { params: Promise<{ id: string }> };

// ---- GET /api/areas/:id ----
export async function GET(
  request: Request,
  { params }: Params
): Promise<NextResponse> {
  try {
    await requireAuthenticatedUser(request);

    const { id } = await params;

    const area = await prisma.area.findUnique({
      where: { id },
      select: {
        id: true,
        plantId: true,
        code: true,
        name: true,
        ownerId: true,
        createdAt: true,
        updatedAt: true,
        plant: { select: { id: true, code: true, name: true, timezone: true } },
        owner: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    if (!area) {
      throw new NotFoundError("Area not found.");
    }

    return NextResponse.json({ data: area });
  } catch (error) {
    return handleApiError(error);
  }
}

// ---- PATCH /api/areas/:id — ADMIN only ----
export async function PATCH(
  request: Request,
  { params }: Params
): Promise<NextResponse> {
  try {
    const actor = await requireAuthenticatedUser(request);

    if (actor.role !== "ADMIN") {
      throw new ForbiddenError("Only ADMIN users may update areas.");
    }

    const { id } = await params;

    const existing = await prisma.area.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundError("Area not found.");
    }

    const rawBody = await request.json().catch(() => null);
    const body = PatchAreaSchema.parse(rawBody);

    // If ownerId is being changed, validate the new owner
    if (body.ownerId !== undefined) {
      const owner = await prisma.user.findUnique({
        where: { id: body.ownerId },
        select: { id: true, isActive: true },
      });
      if (!owner) {
        throw new BadRequestError(
          `User with id "${body.ownerId}" does not exist.`
        );
      }
      if (!owner.isActive) {
        throw new BadRequestError(
          "The specified area owner is deactivated and cannot be assigned."
        );
      }
    }

    const updated = await prisma.area.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.ownerId !== undefined && { ownerId: body.ownerId }),
      },
      select: {
        id: true,
        plantId: true,
        code: true,
        name: true,
        ownerId: true,
        createdAt: true,
        updatedAt: true,
        plant: { select: { id: true, code: true, name: true } },
        owner: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
