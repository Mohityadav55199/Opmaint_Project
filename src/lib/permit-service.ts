/**
 * PermitService — application-layer permit operations.
 *
 * Orchestrates: input validation → equipment lookup → domain rules
 * → transactional DB write → audit log creation.
 *
 * Rule: NO state-transition logic lives here.
 * All transition decisions are made by checkAction() / getNextStatus()
 * from the domain state-machine.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { AuthenticatedUser, PermitData } from "../domain/types";
import {
  checkAction,
  getNextStatus,
} from "../domain/state-machine/engine";
import {
  getPermitType,
  validatePermitTypeData,
} from "../domain/permit-registry";
import { buildAuditLogData } from "../domain/audit";
import { allocateNextPermitNumber } from "./permit-number";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnprocessableEntityError,
} from "./errors";
import {
  SUPPORTED_PERMIT_TYPES,
  type CreatePermitInput,
  type PatchPermitInput,
  type ListPermitsQuery,
} from "./permit-schemas";

// ─── Permit select shape used consistently across all reads ─────────────────

export const PERMIT_SELECT = {
  id: true,
  permitSequence: true,
  permitNumber: true,
  status: true,
  type: true,
  requesterId: true,
  contractorTeam: true,
  workDescription: true,
  equipmentId: true,
  plannedStartTime: true,
  plannedEndTime: true,
  expiresAt: true,
  actualStartTime: true,
  actualEndTime: true,
  hazards: true,
  ppeRequired: true,
  precautionsChecklist: true,
  typeData: true,
  approvalRound: true,
  version: true,
  rejectionReason: true,
  suspensionReason: true,
  cancellationReason: true,
  workCompletionNotes: true,
  closureVerifiedNotes: true,
  activatedById: true,
  suspendedById: true,
  closedById: true,
  createdAt: true,
  updatedAt: true,
  requester: {
    select: { id: true, name: true, email: true, role: true },
  },
  equipment: {
    select: {
      id: true,
      tagNumber: true,
      name: true,
      criticality: true,
      area: {
        select: {
          id: true,
          code: true,
          name: true,
          ownerId: true,
          owner: { select: { id: true, name: true, email: true, role: true } },
          plant: { select: { id: true, code: true, name: true, timezone: true } },
        },
      },
    },
  },
  approvals: {
    select: {
      id: true,
      round: true,
      slot: true,
      approverId: true,
      decision: true,
      comment: true,
      createdAt: true,
      approver: { select: { id: true, name: true, email: true, role: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
  auditLogs: {
    select: {
      id: true,
      actorId: true,
      actorLabel: true,
      actorRole: true,
      action: true,
      field: true,
      fromValue: true,
      toValue: true,
      comment: true,
      metadata: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" as const },
  },
} satisfies Prisma.PermitSelect;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Loads a permit by id with all required relations.
 * Throws NotFoundError if not found.
 */
async function loadPermitOrThrow(id: string) {
  const permit = await prisma.permit.findUnique({
    where: { id },
    select: PERMIT_SELECT,
  });
  if (!permit) throw new NotFoundError("Permit not found.");
  return permit;
}

/**
 * Validates equipment exists and returns the record with its area+plant chain.
 * Throws BadRequestError if equipment does not exist.
 */
async function loadEquipmentOrThrow(equipmentId: string) {
  const equipment = await prisma.equipment.findUnique({
    where: { id: equipmentId },
    select: {
      id: true,
      tagNumber: true,
      name: true,
      areaId: true,
      area: {
        select: {
          id: true,
          plantId: true,
          ownerId: true,
        },
      },
    },
  });
  if (!equipment) {
    throw new BadRequestError(`Equipment with id "${equipmentId}" does not exist.`);
  }
  return equipment;
}

/**
 * Validates permit type exists in registry and validates typeData against it.
 * Throws UnprocessableEntityError on failure.
 */
function validateTypeAndData(type: string, typeData: unknown): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!SUPPORTED_PERMIT_TYPES.includes(type as any)) {
    throw new BadRequestError(
      `Permit type "${type}" is not supported. Supported types: ${SUPPORTED_PERMIT_TYPES.join(", ")}`
    );
  }
  const def = getPermitType(type);
  if (!def) {
    throw new BadRequestError(
      `Permit type "${type}" is not supported. Supported types: ${SUPPORTED_PERMIT_TYPES.join(", ")}`
    );
  }
  const result = validatePermitTypeData(type, typeData);
  if (!result.success) {
    throw new UnprocessableEntityError(
      `Type-specific validation failed: ${result.errors.join("; ")}`
    );
  }
}

/**
 * Casts a DB permit row to PermitData for use by domain functions.
 * Only maps the fields the domain engine actually reads.
 */
function toPermitData(
  permit: Awaited<ReturnType<typeof loadPermitOrThrow>>
): PermitData {
  return {
    id: permit.id,
    permitSequence: permit.permitSequence,
    permitNumber: permit.permitNumber,
    status: permit.status,
    type: permit.type,
    requesterId: permit.requesterId,
    contractorTeam: permit.contractorTeam,
    workDescription: permit.workDescription,
    equipmentId: permit.equipmentId,
    plannedStartTime: permit.plannedStartTime,
    plannedEndTime: permit.plannedEndTime,
    expiresAt: permit.expiresAt,
    hazards: permit.hazards as string[],
    ppeRequired: permit.ppeRequired as string[],
    precautionsChecklist: permit.precautionsChecklist as Record<string, boolean>,
    typeData: permit.typeData as Record<string, unknown>,
    approvalRound: permit.approvalRound,
    version: permit.version,
    rejectionReason: permit.rejectionReason,
    suspensionReason: permit.suspensionReason,
    cancellationReason: permit.cancellationReason,
    workCompletionNotes: permit.workCompletionNotes,
    closureVerifiedNotes: permit.closureVerifiedNotes,
    activatedById: permit.activatedById,
    suspendedById: permit.suspendedById,
    closedById: permit.closedById,
    createdAt: permit.createdAt,
    updatedAt: permit.updatedAt,
    approvals: permit.approvals.map((a) => ({
      id: a.id,
      permitId: permit.id,
      round: a.round,
      slot: a.slot,
      approverId: a.approverId,
      decision: a.decision,
      comment: a.comment,
      createdAt: a.createdAt,
    })),
  };
}

// ─── Service operations ─────────────────────────────────────────────────────

/**
 * Creates a new Permit in DRAFT status.
 *
 * Enforces:
 * - Registry permit type validation
 * - Equipment exists (derives Area + Plant)
 * - expiresAt = plannedEndTime (server-set)
 * - Permit number allocated within advisory-locked transaction
 * - Audit entry for DRAFT_CREATED
 */
export async function createDraft(
  actor: AuthenticatedUser,
  input: CreatePermitInput
) {
  // 1. Validate permit type and typeData via registry
  validateTypeAndData(input.type, input.typeData);

  // 2. Validate equipment exists
  await loadEquipmentOrThrow(input.equipmentId);

  // 3. Server-controlled fields
  const expiresAt = input.plannedEndTime; // always equal to plannedEndTime at creation

  // 4. Transactional creation with advisory lock for permit number
  const permit = await prisma.$transaction(async (tx) => {
    const { permitNumber, sequence } = await allocateNextPermitNumber(tx);

    const created = await tx.permit.create({
      data: {
        permitNumber,
        permitSequence: sequence,
        status: "DRAFT",
        type: input.type,
        requesterId: actor.id,
        contractorTeam: input.contractorTeam,
        workDescription: input.workDescription,
        equipmentId: input.equipmentId,
        plannedStartTime: input.plannedStartTime,
        plannedEndTime: input.plannedEndTime,
        expiresAt,
        hazards: input.hazards as Prisma.InputJsonValue,
        ppeRequired: input.ppeRequired as Prisma.InputJsonValue,
        precautionsChecklist: input.precautionsChecklist as Prisma.InputJsonValue,
        typeData: input.typeData as Prisma.InputJsonValue,
        auditLogs: {
          create: buildAuditLogData({
            actorId: actor.id,
            actorLabel: actor.name,
            actorRole: actor.role,
            action: "DRAFT_CREATED",
            fromValue: null,
            toValue: "DRAFT",
            comment: `Draft permit created by ${actor.name}`,
          }),
        },
      },
      select: { id: true },
    });

    return created;
  });

  // 5. Return full permit with relations
  return loadPermitOrThrow(permit.id);
}

/**
 * Updates a DRAFT permit.
 *
 * Only the requester who created it may edit (or ADMIN per domain EDIT authorization).
 * Re-validates typeData via registry.
 * Recalculates expiresAt = plannedEndTime server-side.
 */
export async function updateDraft(
  actor: AuthenticatedUser,
  id: string,
  input: PatchPermitInput
) {
  const existing = await loadPermitOrThrow(id);

  // 1. Must be DRAFT
  if (existing.status !== "DRAFT") {
    throw new ConflictError(
      `Only DRAFT permits can be edited. Current status is '${existing.status}'.`
    );
  }

  // 2. Authorization: requester or ADMIN
  const permitData = toPermitData(existing);
  const authCheck = checkAction(permitData, actor, "EDIT");
  if (!authCheck.allowed) {
    throw new ForbiddenError(authCheck.reason ?? "You are not authorized to edit this permit.");
  }

  // 3. Merge existing fields with updates
  const mergedType = existing.type; // type is immutable after creation
  const mergedEquipmentId = input.equipmentId ?? existing.equipmentId;
  const mergedContractorTeam = input.contractorTeam ?? existing.contractorTeam;
  const mergedWorkDescription = input.workDescription ?? existing.workDescription;
  const mergedPlannedStart = input.plannedStartTime ?? existing.plannedStartTime;
  const mergedPlannedEnd = input.plannedEndTime ?? existing.plannedEndTime;
  const mergedHazards = input.hazards ?? (existing.hazards as string[]);
  const mergedPpe = input.ppeRequired ?? (existing.ppeRequired as string[]);
  const mergedChecklist =
    input.precautionsChecklist ?? (existing.precautionsChecklist as Record<string, boolean>);
  const mergedTypeData = input.typeData ?? (existing.typeData as Record<string, unknown>);

  // 4. If equipmentId changed, validate it
  if (input.equipmentId && input.equipmentId !== existing.equipmentId) {
    await loadEquipmentOrThrow(input.equipmentId);
  }

  // 5. Re-validate typeData
  validateTypeAndData(mergedType, mergedTypeData);

  // 6. Date sanity (basic pre-check before domain submit rules)
  if (mergedPlannedStart >= mergedPlannedEnd) {
    throw new UnprocessableEntityError("plannedEndTime must be strictly after plannedStartTime.");
  }

  // 7. expiresAt always tracks plannedEndTime on DRAFT
  const expiresAt = mergedPlannedEnd;

  // 8. Transactional update
  await prisma.$transaction(async (tx) => {
    await tx.permit.update({
      where: { id, version: existing.version }, // optimistic concurrency
      data: {
        equipmentId: mergedEquipmentId,
        contractorTeam: mergedContractorTeam,
        workDescription: mergedWorkDescription,
        plannedStartTime: mergedPlannedStart,
        plannedEndTime: mergedPlannedEnd,
        expiresAt,
        hazards: mergedHazards as Prisma.InputJsonValue,
        ppeRequired: mergedPpe as Prisma.InputJsonValue,
        precautionsChecklist: mergedChecklist as Prisma.InputJsonValue,
        typeData: mergedTypeData as Prisma.InputJsonValue,
        version: { increment: 1 },
      },
    });

    await tx.auditLog.create({
      data: {
        permitId: id,
        ...buildAuditLogData({
          actorId: actor.id,
          actorLabel: actor.name,
          actorRole: actor.role,
          action: "EDIT",
          comment: "Draft permit updated",
        }),
      },
    });
  });

  return loadPermitOrThrow(id);
}

/**
 * Retrieves a single permit by id.
 * Any authenticated user may view any permit.
 */
export async function getPermit(id: string) {
  return loadPermitOrThrow(id);
}

/**
 * Lists permits with optional filters.
 * areaId / plantId filtering works through Equipment → Area → Plant.
 */
export async function listPermits(
  actor: AuthenticatedUser,
  query: ListPermitsQuery
) {
  // Build Prisma where clause without any redundant foreign keys on Permit
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {};

  if (query.status) where.status = query.status;
  if (query.type) where.type = query.type;
  if (query.equipmentId) where.equipmentId = query.equipmentId;
  if (query.requesterId) where.requesterId = query.requesterId;
  if (query.mine) where.requesterId = actor.id;

  // areaId filter: Permit → Equipment → Area
  if (query.areaId) {
    where.equipment = { ...(where.equipment ?? {}), areaId: query.areaId };
  }
  // plantId filter: Permit → Equipment → Area → Plant
  if (query.plantId) {
    where.equipment = {
      ...(where.equipment ?? {}),
      area: { plantId: query.plantId },
    };
  }

  // Date range on plannedStartTime
  if (query.from || query.to) {
    where.plannedStartTime = {};
    if (query.from) where.plannedStartTime.gte = query.from;
    if (query.to) where.plannedStartTime.lte = query.to;
  }

  const skip = (query.page - 1) * query.pageSize;

  const [permits, total] = await prisma.$transaction([
    prisma.permit.findMany({
      where,
      skip,
      take: query.pageSize,
      orderBy: { createdAt: "desc" },
      select: PERMIT_SELECT,
    }),
    prisma.permit.count({ where }),
  ]);

  return {
    data: permits,
    total,
    page: query.page,
    pageSize: query.pageSize,
    pagination: {
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    },
  };
}

/**
 * Submits a DRAFT permit for approval.
 *
 * Delegates ALL authorization and validation to checkAction(permit, actor, "SUBMIT").
 * Status transition: DRAFT → PENDING_APPROVAL via getNextStatus().
 * Performed in a single database transaction with audit log.
 */
export async function submitPermit(actor: AuthenticatedUser, id: string) {
  const existing = await loadPermitOrThrow(id);
  const permitData = toPermitData(existing);

  // Domain engine decides: authorization + all submit business rules
  const check = checkAction(permitData, actor, "SUBMIT");
  if (!check.allowed) {
    const StatusMap: Record<number, () => Error> = {
      403: () => new ForbiddenError(check.reason ?? "Forbidden"),
      422: () => new UnprocessableEntityError(check.reason ?? "Validation failed"),
      409: () => new ConflictError(check.reason ?? "Conflict"),
    };
    const factory = StatusMap[check.httpStatus] ?? (() => new ConflictError(check.reason ?? "Action not allowed"));
    throw factory();
  }

  const nextStatus = getNextStatus(existing.status, "SUBMIT");

  // Transactional state change + audit (prevents duplicate concurrent submission)
  await prisma.$transaction(async (tx) => {
    const updated = await tx.permit.updateMany({
      where: {
        id,
        status: "DRAFT", // guard against concurrent transition
        version: existing.version,
      },
      data: {
        status: nextStatus,
        version: { increment: 1 },
      },
    });

    if (updated.count === 0) {
      throw new ConflictError(
        "Permit was already submitted or modified concurrently. Please refresh and try again."
      );
    }

    await tx.auditLog.create({
      data: {
        permitId: id,
        ...buildAuditLogData({
          actorId: actor.id,
          actorLabel: actor.name,
          actorRole: actor.role,
          action: "SUBMIT",
          fromValue: "DRAFT",
          toValue: nextStatus,
          comment: "Permit submitted for approval",
        }),
      },
    });
  });

  return loadPermitOrThrow(id);
}
