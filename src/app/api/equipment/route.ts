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

const VALID_CRITICALITY = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

const CreateEquipmentSchema = z.object({
  areaId: z.string().min(1, "areaId is required"),
  tagNumber: z.string().trim().min(1, "tagNumber is required").max(64),
  name: z.string().trim().min(1, "Equipment name is required").max(128),
  criticality: z.enum(VALID_CRITICALITY).default("MEDIUM"),
});

// ---- GET /api/equipment?areaId=&plantId= — all authenticated users ----
export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requireAuthenticatedUser(request);

    const { searchParams } = new URL(request.url);
    const areaIdFilter = searchParams.get("areaId");
    const plantIdFilter = searchParams.get("plantId");

    // Build filter — plantId filter requires joining through area
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = {};
    if (areaIdFilter) {
      where.areaId = areaIdFilter;
    } else if (plantIdFilter) {
      // Resolve Equipment → Area → Plant via nested relation filter
      where.area = { plantId: plantIdFilter };
    }

    const equipment = await prisma.equipment.findMany({
      where,
      orderBy: { createdAt: "asc" },
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

    return NextResponse.json({ data: equipment, total: equipment.length });
  } catch (error) {
    return handleApiError(error);
  }
}

// ---- POST /api/equipment — ADMIN only ----
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireAuthenticatedUser(request);

    if (actor.role !== "ADMIN") {
      throw new ForbiddenError("Only ADMIN users may create equipment.");
    }

    const rawBody = await request.json().catch(() => null);
    const body = CreateEquipmentSchema.parse(rawBody);

    // areaId must reference an existing area
    const area = await prisma.area.findUnique({
      where: { id: body.areaId },
      select: { id: true },
    });
    if (!area) {
      throw new BadRequestError(
        `Area with id "${body.areaId}" does not exist.`
      );
    }

    // tagNumber uniqueness guard
    const existingTag = await prisma.equipment.findUnique({
      where: { tagNumber: body.tagNumber },
      select: { id: true },
    });
    if (existingTag) {
      throw new ConflictError(
        `Equipment with tagNumber "${body.tagNumber}" already exists.`
      );
    }

    const equipment = await prisma.equipment.create({
      data: {
        areaId: body.areaId,
        tagNumber: body.tagNumber,
        name: body.name,
        criticality: body.criticality,
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

    return NextResponse.json({ data: equipment }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
