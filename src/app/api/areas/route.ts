import { z } from "zod";
import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { requireAuthenticatedUser } from "../../../lib/auth";
import {
  handleApiError,
  ForbiddenError,
  ConflictError,
  BadRequestError,
} from "../../../lib/errors";

// ---- Validation schema ----
const CreateAreaSchema = z.object({
  plantId: z.string().min(1, "plantId is required"),
  code: z.string().trim().min(1, "Area code is required").max(32),
  name: z.string().trim().min(1, "Area name is required").max(128),
  ownerId: z.string().min(1, "ownerId is required"),
});

// ---- GET /api/areas?plantId= — all authenticated users ----
export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requireAuthenticatedUser(request);

    const { searchParams } = new URL(request.url);
    const plantIdFilter = searchParams.get("plantId");

    const areas = await prisma.area.findMany({
      where: plantIdFilter ? { plantId: plantIdFilter } : undefined,
      orderBy: { createdAt: "asc" },
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

    return NextResponse.json({ data: areas, total: areas.length });
  } catch (error) {
    return handleApiError(error);
  }
}

// ---- POST /api/areas — ADMIN only ----
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireAuthenticatedUser(request);

    if (actor.role !== "ADMIN") {
      throw new ForbiddenError("Only ADMIN users may create areas.");
    }

    const rawBody = await request.json().catch(() => null);
    const body = CreateAreaSchema.parse(rawBody);

    // plantId must reference an existing plant
    const plant = await prisma.plant.findUnique({
      where: { id: body.plantId },
      select: { id: true },
    });
    if (!plant) {
      throw new BadRequestError(
        `Plant with id "${body.plantId}" does not exist.`
      );
    }

    // ownerId must reference an existing active user
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

    // Duplicate (plantId, code) guard — Prisma will also catch this, but give a clean error
    const existingArea = await prisma.area.findUnique({
      where: { plantId_code: { plantId: body.plantId, code: body.code } },
      select: { id: true },
    });
    if (existingArea) {
      throw new ConflictError(
        `An area with code "${body.code}" already exists in this plant.`
      );
    }

    const area = await prisma.area.create({
      data: {
        plantId: body.plantId,
        code: body.code,
        name: body.name,
        ownerId: body.ownerId,
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

    return NextResponse.json({ data: area }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
