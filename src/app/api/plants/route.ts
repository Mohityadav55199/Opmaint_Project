import { z } from "zod";
import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { requireAuthenticatedUser } from "../../../lib/auth";
import {
  handleApiError,
  ForbiddenError,
  ConflictError,
} from "../../../lib/errors";

// ---- Validation schema ----
const CreatePlantSchema = z.object({
  code: z.string().trim().min(1, "Plant code is required").max(32),
  name: z.string().trim().min(1, "Plant name is required").max(128),
  timezone: z.string().trim().min(1).max(64).default("Asia/Kolkata"),
});

// ---- GET /api/plants — all authenticated users ----
export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requireAuthenticatedUser(request);

    const plants = await prisma.plant.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        timezone: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ data: plants, total: plants.length });
  } catch (error) {
    return handleApiError(error);
  }
}

// ---- POST /api/plants — ADMIN only ----
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireAuthenticatedUser(request);

    if (actor.role !== "ADMIN") {
      throw new ForbiddenError("Only ADMIN users may create plants.");
    }

    const rawBody = await request.json().catch(() => null);
    const body = CreatePlantSchema.parse(rawBody);

    // Duplicate code guard
    const existing = await prisma.plant.findUnique({
      where: { code: body.code },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictError(
        `A plant with code "${body.code}" already exists.`
      );
    }

    const plant = await prisma.plant.create({
      data: {
        code: body.code,
        name: body.name,
        timezone: body.timezone,
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

    return NextResponse.json({ data: plant }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
