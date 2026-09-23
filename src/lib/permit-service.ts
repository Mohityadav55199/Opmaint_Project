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
import { ApprovalSlot, AuthenticatedUser, PermitData, PermitStatus } from "../domain/types";
import {
  checkAction,
  getNextStatus,
} from "../domain/state-machine/engine";
import { evaluateApprovalSlots } from "../domain/approvals/slots";
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
  type ApprovePermitInput,
  type RejectPermitInput,
  type SuspendPermitInput,
  type CancelPermitInput,
  type ClosePermitInput,
  type VerifyClosurePermitInput,
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
/**
 * Asserts that checkAction returned allowed: true.
 * If not, maps check.httpStatus to appropriate domain error.
 */
function assertActionAllowed(check: ReturnType<typeof checkAction>): void {
  if (!check.allowed) {
    const StatusMap: Record<number, () => Error> = {
      400: () => new BadRequestError(check.reason ?? "Bad request"),
      403: () => new ForbiddenError(check.reason ?? "Forbidden"),
      409: () => new ConflictError(check.reason ?? "Conflict"),
      422: () => new UnprocessableEntityError(check.reason ?? "Validation failed"),
    };
    const factory = StatusMap[check.httpStatus] ?? (() => new ConflictError(check.reason ?? "Action not allowed"));
    throw factory();
  }
}

/**
 * Casts a DB permit row to PermitData for use by domain functions.
 * Maps equipment and area relationships so area owner is resolved authoritatively.
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
    areaId: permit.equipment?.area?.id,
    plantId: permit.equipment?.area?.plant?.id,
    plannedStartTime: permit.plannedStartTime,
    plannedEndTime: permit.plannedEndTime,
    expiresAt: permit.expiresAt,
    actualStartTime: permit.actualStartTime,
    actualEndTime: permit.actualEndTime,
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
    equipment: permit.equipment
      ? {
          id: permit.equipment.id,
          tagNumber: permit.equipment.tagNumber,
          name: permit.equipment.name,
          criticality: permit.equipment.criticality,
          areaId: permit.equipment.area.id,
          area: {
            id: permit.equipment.area.id,
            code: permit.equipment.area.code,
            name: permit.equipment.area.name,
            ownerId: permit.equipment.area.ownerId,
            plantId: permit.equipment.area.plant.id,
          },
        }
      : undefined,
    area: permit.equipment?.area
      ? {
          id: permit.equipment.area.id,
          code: permit.equipment.area.code,
          name: permit.equipment.area.name,
          ownerId: permit.equipment.area.ownerId,
          plantId: permit.equipment.area.plant.id,
        }
      : undefined,
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
  assertActionAllowed(check);

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

// ─── Phase 4: Workflow Operations ───────────────────────────────────────────

/**
 * Approves a permit for an eligible approval slot in the current round.
 *
 * Rules:
 * - Requester cannot approve (no self-approval under any role)
 * - Area Owner scope enforced (must own equipment's area)
 * - Safety Officer can approve any permit
 * - Admin can approve any slot
 * - Slot and round cannot be duplicated
 * - Concurrency protected via PostgreSQL FOR UPDATE row lock
 * - If all required slots are approved, status transitions PENDING_APPROVAL → APPROVED
 * - If partial approval, status remains PENDING_APPROVAL
 * - Transactional audit log recording
 */
export async function approvePermit(
  actor: AuthenticatedUser,
  id: string,
  input?: ApprovePermitInput
) {
  const existing = await loadPermitOrThrow(id);
  const permitData = toPermitData(existing);

  const check = checkAction(permitData, actor, "APPROVE");
  assertActionAllowed(check);

  const eligibleSlots = check.eligibleSlots || [];
  let slotToFill: ApprovalSlot;
  if (input?.slot) {
    if (!eligibleSlots.includes(input.slot)) {
      throw new ForbiddenError(
        `You are not authorized to approve for slot '${input.slot}', or this slot is already filled.`
      );
    }
    slotToFill = input.slot;
  } else {
    if (eligibleSlots.length === 0) {
      throw new ForbiddenError("No unfilled approval slots available for your role.");
    }
    slotToFill = eligibleSlots[0];
  }

  await prisma.$transaction(async (tx) => {
    // Acquire row-level lock on the permit row to prevent race conditions during concurrent approvals
    const [locked] = await tx.$queryRaw<Array<{ id: string; status: string; approvalRound: number; version: number }>>`
      SELECT id, status, "approvalRound", version FROM "Permit" WHERE id = ${id} FOR UPDATE
    `;
    if (!locked) throw new NotFoundError("Permit not found.");

    if (locked.status !== "PENDING_APPROVAL") {
      throw new ConflictError(`Cannot approve permit in status '${locked.status}'.`);
    }

    // Check if slot was already filled in this round concurrently
    const existingSlotApproval = await tx.approval.findFirst({
      where: {
        permitId: id,
        round: locked.approvalRound,
        slot: slotToFill,
      },
    });
    if (existingSlotApproval) {
      throw new ConflictError(
        `Slot '${slotToFill}' has already been filled for round ${locked.approvalRound}.`
      );
    }

    // Check if this approver already approved another slot in this round
    const existingUserApproval = await tx.approval.findFirst({
      where: {
        permitId: id,
        round: locked.approvalRound,
        approverId: actor.id,
      },
    });
    if (existingUserApproval) {
      throw new ForbiddenError(
        "Dual slot approval forbidden: a single person cannot fill multiple required approval slots."
      );
    }

    // Insert approval record
    await tx.approval.create({
      data: {
        permitId: id,
        round: locked.approvalRound,
        slot: slotToFill,
        approverId: actor.id,
        decision: "APPROVED",
        comment: input?.comment?.trim() || null,
        signatureSvg: input?.signatureSvg || null,
      },
    });

    // Re-fetch all current round approvals to evaluate completion
    const roundApprovals = await tx.approval.findMany({
      where: { permitId: id, round: locked.approvalRound },
    });

    const updatedPermitData: PermitData = {
      ...permitData,
      approvalRound: locked.approvalRound,
      approvals: roundApprovals.map((a) => ({
        id: a.id,
        permitId: a.permitId,
        round: a.round,
        slot: a.slot,
        approverId: a.approverId,
        decision: a.decision,
        comment: a.comment,
        createdAt: a.createdAt,
      })),
    };

    const roundStatus = evaluateApprovalSlots(updatedPermitData);
    const nextStatus = getNextStatus(locked.status as PermitStatus, "APPROVE", {
      allApprovalsComplete: roundStatus.allSlotsFilled,
    });

    await tx.permit.update({
      where: { id },
      data: {
        status: nextStatus,
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
          action: "APPROVE",
          fromValue: locked.status,
          toValue: nextStatus,
          comment: input?.comment?.trim() || `Approved slot ${slotToFill}`,
          metadata: { slot: slotToFill, round: locked.approvalRound },
        }),
      },
    });
  });

  return loadPermitOrThrow(id);
}

/**
 * Rejects a permit in PENDING_APPROVAL status.
 *
 * Rules:
 * - Mandatory non-empty reason required
 * - User must be eligible to fill an unfilled slot
 * - Self-rejection by requester forbidden
 * - Records rejection in Approval table
 * - Transitions permit PENDING_APPROVAL → REJECTED
 * - Transactional audit log recording
 */
export async function rejectPermit(
  actor: AuthenticatedUser,
  id: string,
  input: RejectPermitInput
) {
  if (!input.reason || !input.reason.trim()) {
    throw new UnprocessableEntityError("A mandatory non-empty rejection reason is required.");
  }

  const existing = await loadPermitOrThrow(id);
  const permitData = toPermitData(existing);

  const check = checkAction(permitData, actor, "REJECT");
  assertActionAllowed(check);

  const eligibleSlots = check.eligibleSlots || [];
  let slotToUse: ApprovalSlot;
  if (input.slot) {
    if (!eligibleSlots.includes(input.slot)) {
      throw new ForbiddenError(`You do not hold eligible slot '${input.slot}' to reject this permit.`);
    }
    slotToUse = input.slot;
  } else {
    if (eligibleSlots.length === 0) {
      throw new ForbiddenError("No eligible unfilled approval slot available to reject this permit.");
    }
    slotToUse = eligibleSlots[0];
  }

  const nextStatus = getNextStatus(existing.status, "REJECT");

  await prisma.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<Array<{ id: string; status: string; approvalRound: number; version: number }>>`
      SELECT id, status, "approvalRound", version FROM "Permit" WHERE id = ${id} FOR UPDATE
    `;
    if (!locked) throw new NotFoundError("Permit not found.");

    if (locked.status !== "PENDING_APPROVAL") {
      throw new ConflictError(`Cannot reject permit in status '${locked.status}'.`);
    }

    await tx.approval.create({
      data: {
        permitId: id,
        round: locked.approvalRound,
        slot: slotToUse,
        approverId: actor.id,
        decision: "REJECTED",
        comment: input.reason.trim(),
      },
    });

    await tx.permit.update({
      where: { id },
      data: {
        status: nextStatus,
        rejectionReason: input.reason.trim(),
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
          action: "REJECT",
          fromValue: locked.status,
          toValue: nextStatus,
          comment: input.reason.trim(),
          metadata: { slot: slotToUse, round: locked.approvalRound },
        }),
      },
    });
  });

  return loadPermitOrThrow(id);
}

/**
 * Activates an APPROVED permit (APPROVED → ACTIVE).
 *
 * Rules:
 * - Must be APPROVED
 * - All required approvals must have signed off
 * - current time >= plannedStartTime and < expiresAt
 * - Must be authorized by domain checkAction (requester, SAFETY_OFFICER, ADMIN)
 * - Records activatedById, actualStartTime, and audit log
 */
export async function activatePermit(actor: AuthenticatedUser, id: string) {
  const existing = await loadPermitOrThrow(id);
  const permitData = toPermitData(existing);

  const now = new Date();
  const check = checkAction(permitData, actor, "ACTIVATE", now);
  assertActionAllowed(check);

  const nextStatus = getNextStatus(existing.status, "ACTIVATE");

  await prisma.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<Array<{ id: string; status: string; version: number }>>`
      SELECT id, status, version FROM "Permit" WHERE id = ${id} FOR UPDATE
    `;
    if (!locked) throw new NotFoundError("Permit not found.");

    if (locked.status !== "APPROVED") {
      throw new ConflictError(`Cannot activate permit in status '${locked.status}'.`);
    }

    await tx.permit.update({
      where: { id },
      data: {
        status: nextStatus,
        activatedById: actor.id,
        actualStartTime: now,
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
          action: "ACTIVATE",
          fromValue: locked.status,
          toValue: nextStatus,
          comment: `Permit activated by ${actor.name}`,
        }),
      },
    });
  });

  return loadPermitOrThrow(id);
}

/**
 * Suspends an ACTIVE permit (ACTIVE → SUSPENDED).
 *
 * Rules:
 * - Must be ACTIVE
 * - Requires mandatory non-empty suspension reason
 * - Authorized only for SAFETY_OFFICER or ADMIN
 * - Records suspendedById, suspensionReason, and audit log
 */
export async function suspendPermit(
  actor: AuthenticatedUser,
  id: string,
  input: SuspendPermitInput
) {
  if (!input.reason || !input.reason.trim()) {
    throw new UnprocessableEntityError("A mandatory non-empty suspension reason is required.");
  }

  const existing = await loadPermitOrThrow(id);
  const permitData = toPermitData(existing);

  const check = checkAction(permitData, actor, "SUSPEND");
  assertActionAllowed(check);

  const nextStatus = getNextStatus(existing.status, "SUSPEND");

  await prisma.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<Array<{ id: string; status: string; version: number }>>`
      SELECT id, status, version FROM "Permit" WHERE id = ${id} FOR UPDATE
    `;
    if (!locked) throw new NotFoundError("Permit not found.");

    if (locked.status !== "ACTIVE") {
      throw new ConflictError(`Cannot suspend permit in status '${locked.status}'.`);
    }

    await tx.permit.update({
      where: { id },
      data: {
        status: nextStatus,
        suspendedById: actor.id,
        suspensionReason: input.reason.trim(),
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
          action: "SUSPEND",
          fromValue: locked.status,
          toValue: nextStatus,
          comment: input.reason.trim(),
        }),
      },
    });
  });

  return loadPermitOrThrow(id);
}

/**
 * Resumes a SUSPENDED permit (SUSPENDED → ACTIVE).
 *
 * Rules:
 * - Must be SUSPENDED
 * - Permit must not have expired
 * - Authorized only for SAFETY_OFFICER or ADMIN
 * - Preserves suspension history and writes audit log
 */
export async function resumePermit(actor: AuthenticatedUser, id: string) {
  const existing = await loadPermitOrThrow(id);
  const permitData = toPermitData(existing);

  const now = new Date();
  const check = checkAction(permitData, actor, "RESUME", now);
  assertActionAllowed(check);

  const nextStatus = getNextStatus(existing.status, "RESUME");

  await prisma.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<Array<{ id: string; status: string; version: number }>>`
      SELECT id, status, version FROM "Permit" WHERE id = ${id} FOR UPDATE
    `;
    if (!locked) throw new NotFoundError("Permit not found.");

    if (locked.status !== "SUSPENDED") {
      throw new ConflictError(`Cannot resume permit in status '${locked.status}'.`);
    }

    await tx.permit.update({
      where: { id },
      data: {
        status: nextStatus,
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
          action: "RESUME",
          fromValue: locked.status,
          toValue: nextStatus,
          comment: `Permit resumed from suspension by ${actor.name}`,
        }),
      },
    });
  });

  return loadPermitOrThrow(id);
}

/**
 * Closes an ACTIVE permit (ACTIVE → CLOSED).
 *
 * Rules:
 * - Must be ACTIVE
 * - Requires non-empty workCompletionNotes
 * - Requester or ADMIN authorized
 * - Records closedById, actualEndTime, and audit log
 */
export async function closePermit(
  actor: AuthenticatedUser,
  id: string,
  input: ClosePermitInput
) {
  if (!input.workCompletionNotes || !input.workCompletionNotes.trim()) {
    throw new UnprocessableEntityError("Work completion notes and housekeeping confirmation are required to close the permit.");
  }

  const existing = await loadPermitOrThrow(id);
  const permitData = toPermitData(existing);

  const now = new Date();
  const check = checkAction(permitData, actor, "CLOSE", now);
  assertActionAllowed(check);

  const nextStatus = getNextStatus(existing.status, "CLOSE");

  await prisma.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<Array<{ id: string; status: string; version: number }>>`
      SELECT id, status, version FROM "Permit" WHERE id = ${id} FOR UPDATE
    `;
    if (!locked) throw new NotFoundError("Permit not found.");

    if (locked.status !== "ACTIVE") {
      throw new ConflictError(`Cannot close permit in status '${locked.status}'.`);
    }

    await tx.permit.update({
      where: { id },
      data: {
        status: nextStatus,
        closedById: actor.id,
        actualEndTime: now,
        workCompletionNotes: input.workCompletionNotes.trim(),
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
          action: "CLOSE",
          fromValue: locked.status,
          toValue: nextStatus,
          comment: input.workCompletionNotes.trim(),
        }),
      },
    });
  });

  return loadPermitOrThrow(id);
}

/**
 * Verifies closure of a CLOSED permit (CLOSED → CLOSED_VERIFIED).
 *
 * Rules:
 * - Must be CLOSED
 * - Safety Officer or Admin authorized
 * - Separation of duties: Requester cannot verify; Verifier cannot be the person who closed the permit
 * - Records closureVerifiedNotes and audit log
 */
export async function verifyClosurePermit(
  actor: AuthenticatedUser,
  id: string,
  input?: VerifyClosurePermitInput
) {
  const existing = await loadPermitOrThrow(id);
  const permitData = toPermitData(existing);

  const now = new Date();
  const check = checkAction(permitData, actor, "VERIFY_CLOSURE", now);
  assertActionAllowed(check);

  const nextStatus = getNextStatus(existing.status, "VERIFY_CLOSURE");

  await prisma.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<Array<{ id: string; status: string; version: number }>>`
      SELECT id, status, version FROM "Permit" WHERE id = ${id} FOR UPDATE
    `;
    if (!locked) throw new NotFoundError("Permit not found.");

    if (locked.status !== "CLOSED") {
      throw new ConflictError(`Cannot verify closure in status '${locked.status}'.`);
    }

    await tx.permit.update({
      where: { id },
      data: {
        status: nextStatus,
        closureVerifiedNotes: input?.closureVerifiedNotes?.trim() || null,
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
          action: "VERIFY_CLOSURE",
          fromValue: locked.status,
          toValue: nextStatus,
          comment: input?.closureVerifiedNotes?.trim() || `Closure verified by ${actor.name}`,
        }),
      },
    });
  });

  return loadPermitOrThrow(id);
}

/**
 * Cancels a permit from any non-terminal state (→ CANCELLED).
 *
 * Rules:
 * - Cannot cancel terminal states (REJECTED, EXPIRED, CLOSED_VERIFIED, CANCELLED)
 * - DRAFT/PENDING_APPROVAL/APPROVED: Requester or ADMIN
 * - ACTIVE/SUSPENDED: SAFETY_OFFICER or ADMIN (bypassing safety closure inspection forbidden for requesters)
 * - Requires mandatory cancellation reason
 * - Records cancellationReason and audit log
 */
export async function cancelPermit(
  actor: AuthenticatedUser,
  id: string,
  input: CancelPermitInput
) {
  if (!input.reason || !input.reason.trim()) {
    throw new UnprocessableEntityError("A mandatory non-empty cancellation reason is required.");
  }

  const existing = await loadPermitOrThrow(id);
  const permitData = toPermitData(existing);

  const now = new Date();
  const check = checkAction(permitData, actor, "CANCEL", now);
  assertActionAllowed(check);

  const nextStatus = getNextStatus(existing.status, "CANCEL");

  await prisma.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<Array<{ id: string; status: string; version: number }>>`
      SELECT id, status, version FROM "Permit" WHERE id = ${id} FOR UPDATE
    `;
    if (!locked) throw new NotFoundError("Permit not found.");

    await tx.permit.update({
      where: { id },
      data: {
        status: nextStatus,
        cancellationReason: input.reason.trim(),
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
          action: "CANCEL",
          fromValue: locked.status,
          toValue: nextStatus,
          comment: input.reason.trim(),
        }),
      },
    });
  });

  return loadPermitOrThrow(id);
}

