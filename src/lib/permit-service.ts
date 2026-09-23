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
import { ApprovalSlot, AuthenticatedUser, PermitAction, PermitData, PermitStatus } from "../domain/types";
import {
  checkAction,
  getNextStatus,
} from "../domain/state-machine/engine";
import {
  evaluateApprovalSlots,
  getUserEligibleApprovalSlots,
  hasUserPendingApprovalObligation,
} from "../domain/approvals/slots";
import { isPermitEligibleForExpiry, isExpiringSoon, canStatusExpire } from "../domain/expiry";
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
  type DashboardQuery,
  type ApprovePermitInput,
  type RejectPermitInput,
  type SuspendPermitInput,
  type CancelPermitInput,
  type ClosePermitInput,
  type VerifyClosurePermitInput,
  type LogWorkInput,
  type LogEntryExitInput,
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
  workLogs: {
    select: {
      id: true,
      authorId: true,
      description: true,
      performedAt: true,
      createdAt: true,
      author: { select: { id: true, name: true, email: true, role: true } },
    },
    orderBy: { performedAt: "asc" as const },
  },
  entryExitLogs: {
    select: {
      id: true,
      direction: true,
      personName: true,
      at: true,
      recordedById: true,
      createdAt: true,
      recordedBy: { select: { id: true, name: true, email: true, role: true } },
    },
    orderBy: { at: "asc" as const },
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
 * Checks if a locked permit row has reached expiry.
 * If so, transitions its status to EXPIRED in the database, records a transactional
 * SYSTEM audit log entry, and updates locked.status.
 */
async function checkAndApplyTransactionalExpiry(
  tx: Prisma.TransactionClient,
  permitId: string,
  locked: { id: string; status: string; expiresAt: Date; version: number },
  now: Date
): Promise<boolean> {
  if (
    locked.status !== "EXPIRED" &&
    isPermitEligibleForExpiry({ status: locked.status as PermitStatus, expiresAt: locked.expiresAt }, now)
  ) {
    const fromStatus = locked.status;
    locked.status = "EXPIRED";
    await tx.permit.update({
      where: { id: permitId },
      data: {
        status: "EXPIRED",
        version: { increment: 1 },
      },
    });
    await tx.auditLog.create({
      data: {
        permitId,
        ...buildAuditLogData({
          actorId: null,
          actorLabel: "SYSTEM",
          actorRole: "SYSTEM",
          action: "EXPIRE",
          fromValue: fromStatus,
          toValue: "EXPIRED",
          comment: "Permit validity window expired automatically (now >= expiresAt).",
        }),
      },
    });
    return true;
  }
  return false;
}

/**
 * Atomically checks and applies expiry under a row lock (FOR UPDATE), committing the
 * EXPIRED state and SYSTEM audit log entry if the permit is eligible for expiry.
 * Returns true if the permit was transitioned to EXPIRED or is already EXPIRED.
 */
export async function enforceAuthoritativeExpiry(
  permitId: string,
  now: Date = new Date()
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<Array<{ id: string; status: string; expiresAt: Date; version: number }>>`
      SELECT id, status, "expiresAt", version FROM "Permit" WHERE id = ${permitId} FOR UPDATE
    `;
    if (!locked) return false;
    const didExpire = await checkAndApplyTransactionalExpiry(tx, permitId, locked, now);
    return didExpire || locked.status === "EXPIRED";
  });
}

/**
 * Bulk / lazy expiry reconciliation:
 * Scans for permits that are eligible for expiry and past expiresAt,
 * and transactionally applies EXPIRED status + SYSTEM audit log.
 * Safe to call before queries (such as listPermits, getDashboard) without N+1 overhead,
 * because it first queries matching candidate IDs with a fast indexed check.
 */
export async function reconcileExpiredPermits(
  now: Date = new Date(),
  limit: number = 50
): Promise<string[]> {
  const candidates = await prisma.permit.findMany({
    where: {
      status: { in: ["ACTIVE", "SUSPENDED", "APPROVED", "PENDING_APPROVAL"] },
      expiresAt: { lte: now },
    },
    select: { id: true },
    take: limit,
  });

  if (candidates.length === 0) return [];

  const expiredIds: string[] = [];
  for (const candidate of candidates) {
    const didExpire = await enforceAuthoritativeExpiry(candidate.id, now);
    if (didExpire) {
      expiredIds.push(candidate.id);
    }
  }
  return expiredIds;
}

/**
 * Computes current headcount and roster of people inside a confined space
 * strictly derived from immutable EntryExitLog history.
 */
export function computeConfinedSpaceRoster(
  logs: Array<{ personName: string; direction: "ENTRY" | "EXIT"; at: Date }>
): { currentlyInside: string[]; headcount: number } {
  const sorted = [...logs].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  const inside = new Set<string>();
  for (const log of sorted) {
    if (log.direction === "ENTRY") {
      inside.add(log.personName);
    } else if (log.direction === "EXIT") {
      inside.delete(log.personName);
    }
  }
  const currentlyInside = Array.from(inside);
  return {
    currentlyInside,
    headcount: currentlyInside.length,
  };
}

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
    workLogs: permit.workLogs?.map((w) => ({
      id: w.id,
      permitId: permit.id,
      authorId: w.authorId,
      description: w.description,
      performedAt: w.performedAt,
      createdAt: w.createdAt,
    })),
    entryExitLogs: permit.entryExitLogs?.map((e) => ({
      id: e.id,
      permitId: permit.id,
      direction: e.direction,
      personName: e.personName,
      at: e.at,
      recordedById: e.recordedById,
      createdAt: e.createdAt,
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
 * Enriched with current approval round status and confined-space roster.
 */
export async function getPermit(id: string, actor?: AuthenticatedUser) {
  const now = new Date();
  const existing = await prisma.permit.findUnique({
    where: { id },
    select: { id: true, status: true, expiresAt: true },
  });
  if (
    existing &&
    canStatusExpire(existing.status as PermitStatus) &&
    new Date(existing.expiresAt).getTime() <= now.getTime()
  ) {
    await enforceAuthoritativeExpiry(id, now);
  }

  const permit = await loadPermitOrThrow(id);
  const permitData = toPermitData(permit);

  const approvalStatus = evaluateApprovalSlots(permitData);
  const userSlots = actor ? getUserEligibleApprovalSlots(actor, permitData) : [];

  let roster = undefined;
  if (permit.type === "CONFINED_SPACE_ENTRY" && permit.entryExitLogs) {
    roster = computeConfinedSpaceRoster(permit.entryExitLogs);
  }

  return {
    ...permit,
    isExpired: now.getTime() >= new Date(permit.expiresAt).getTime() || permit.status === "EXPIRED",
    isExpiringSoon: isExpiringSoon(permitData, now),
    approvalStatus: {
      ...approvalStatus,
      canCurrentUserApprove: userSlots.length > 0,
      currentUserEligibleSlots: userSlots,
    },
    roster,
  };
}

/**
 * Evaluates and returns all domain actions currently available to the authenticated user
 * for the specified permit. Uses checkAction() from the domain state machine as the
 * single source of truth.
 */
export async function getAvailableActions(
  actor: AuthenticatedUser,
  id: string
) {
  const now = new Date();
  const existing = await prisma.permit.findUnique({
    where: { id },
    select: { id: true, status: true, expiresAt: true },
  });
  if (
    existing &&
    canStatusExpire(existing.status as PermitStatus) &&
    new Date(existing.expiresAt).getTime() <= now.getTime()
  ) {
    await enforceAuthoritativeExpiry(id, now);
  }

  const permit = await loadPermitOrThrow(id);
  const permitData = toPermitData(permit);

  const candidateActions: PermitAction[] = [
    "SUBMIT",
    "APPROVE",
    "REJECT",
    "ACTIVATE",
    "SUSPEND",
    "RESUME",
    "LOG_WORK",
    "LOG_ENTRY_EXIT",
    "CLOSE",
    "VERIFY_CLOSURE",
    "CANCEL",
    "EDIT",
  ];

  const available: Array<{
    action: PermitAction;
    allowed: boolean;
    reason?: string;
    eligibleSlots?: ApprovalSlot[];
  }> = [];

  for (const action of candidateActions) {
    const check = checkAction(permitData, actor, action, now);
    if (check.allowed) {
      available.push({
        action,
        allowed: true,
        eligibleSlots: check.eligibleSlots,
      });
    }
  }

  return {
    permitId: id,
    status: permit.status,
    type: permit.type,
    actions: available.map((a) => a.action),
    details: available,
  };
}

/**
 * Lists permits with optional filters.
 * Supports status, type, areaId, equipmentId, date, mine, and myApprovals.
 * areaId / plantId filtering works through Equipment → Area → Plant.
 */
export async function listPermits(
  actor: AuthenticatedUser,
  query: Partial<ListPermitsQuery> = {}
) {
  await reconcileExpiredPermits();
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 50;

  // If myApprovals is requested
  if (query.myApprovals) {
    // Pure requesters cannot approve permits
    if (actor.role === "REQUESTER") {
      return {
        data: [],
        total: 0,
        page,
        pageSize,
        pagination: {
          total: 0,
          page,
          pageSize,
          totalPages: 0,
        },
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: Record<string, any> = {
      status: "PENDING_APPROVAL",
      requesterId: { not: actor.id }, // Self-approval prohibited
    };

    if (query.type) where.type = query.type;
    if (query.equipmentId) where.equipmentId = query.equipmentId;
    if (query.areaId) {
      where.equipment = { ...(where.equipment ?? {}), areaId: query.areaId };
    }
    if (query.plantId) {
      where.equipment = {
        ...(where.equipment ?? {}),
        area: { plantId: query.plantId },
      };
    }

    if (actor.role === "AREA_OWNER") {
      where.equipment = {
        ...(where.equipment ?? {}),
        area: { ...(where.equipment?.area ?? {}), ownerId: actor.id },
      };
    }

    // Date range
    if (query.date) {
      const dayStart = new Date(query.date);
      if (!isNaN(dayStart.getTime())) {
        dayStart.setUTCHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
        where.plannedStartTime = { gte: dayStart, lte: dayEnd };
      }
    } else if (query.from || query.to) {
      where.plannedStartTime = {};
      if (query.from) where.plannedStartTime.gte = query.from;
      if (query.to) where.plannedStartTime.lte = query.to;
    }

    const candidatePermits = await prisma.permit.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: PERMIT_SELECT,
    });

    const eligiblePermits = candidatePermits.filter((p) =>
      hasUserPendingApprovalObligation(actor, toPermitData(p))
    );

    const total = eligiblePermits.length;
    const skip = (page - 1) * pageSize;
    const paged = eligiblePermits.slice(skip, skip + pageSize);

    return {
      data: paged,
      total,
      page,
      pageSize,
      pagination: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  // Standard filtering (non-myApprovals)
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

  // Date filter: single day (date) or range (from/to)
  if (query.date) {
    const dayStart = new Date(query.date);
    if (!isNaN(dayStart.getTime())) {
      dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
      where.plannedStartTime = { gte: dayStart, lte: dayEnd };
    }
  } else if (query.from || query.to) {
    where.plannedStartTime = {};
    if (query.from) where.plannedStartTime.gte = query.from;
    if (query.to) where.plannedStartTime.lte = query.to;
  }

  const skip = (page - 1) * pageSize;

  const [permits, total] = await prisma.$transaction([
    prisma.permit.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
      select: PERMIT_SELECT,
    }),
    prisma.permit.count({ where }),
  ]);

  return {
    data: permits,
    total,
    page,
    pageSize,
    pagination: {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

/**
 * Returns dashboard payload containing:
 * 1. Filtered and paginated permit list
 * 2. Active permits currently in progress (status === ACTIVE && now < expiresAt)
 * 3. Permits expiring within the next 2 hours (status === ACTIVE && now < expiresAt <= now + 2h)
 * 4. Pending approvals relevant to authenticated user
 * 5. Useful system-wide and user operational summary counts
 *
 * Strictly pure read; does not mutate database rows.
 */
export async function getDashboard(
  actor: AuthenticatedUser,
  query: DashboardQuery
) {
  const now = new Date();
  await reconcileExpiredPermits(now);
  const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  // 1. Filtered permit list matching the query
  const permitsResult = await listPermits(actor, query);

  // 2. Active permits currently in progress (pure read, non-expired)
  const activePermits = await prisma.permit.findMany({
    where: {
      status: "ACTIVE",
      expiresAt: { gt: now },
    },
    orderBy: { actualStartTime: "desc" },
    take: 10,
    select: PERMIT_SELECT,
  });

  // 3. Permits expiring within the next 2 hours (pure read, strictly active and now < expiresAt <= now + 2h)
  const expiringPermits = await prisma.permit.findMany({
    where: {
      status: "ACTIVE",
      expiresAt: {
        gt: now,
        lte: twoHoursLater,
      },
    },
    orderBy: { expiresAt: "asc" },
    take: 10,
    select: PERMIT_SELECT,
  });

  // 4. Pending approvals relevant to the authenticated user
  const pendingApprovalsResult = await listPermits(actor, {
    myApprovals: true,
    page: 1,
    pageSize: 10,
  });

  // 5. Global & user summary counts
  const statusGroups = await prisma.permit.groupBy({
    by: ["status"],
    _count: { id: true },
  });
  const countsByStatus: Record<string, number> = {};
  for (const g of statusGroups) {
    countsByStatus[g.status] = g._count.id;
  }

  const myPermitsCount = await prisma.permit.count({
    where: { requesterId: actor.id },
  });

  const expiringSoonCount = await prisma.permit.count({
    where: {
      status: "ACTIVE",
      expiresAt: {
        gt: now,
        lte: twoHoursLater,
      },
    },
  });

  const summary = {
    total: Object.values(countsByStatus).reduce((a, b) => a + b, 0),
    draft: countsByStatus["DRAFT"] || 0,
    pendingApproval: countsByStatus["PENDING_APPROVAL"] || 0,
    approved: countsByStatus["APPROVED"] || 0,
    active: countsByStatus["ACTIVE"] || 0,
    suspended: countsByStatus["SUSPENDED"] || 0,
    closed: countsByStatus["CLOSED"] || 0,
    closedVerified: countsByStatus["CLOSED_VERIFIED"] || 0,
    rejected: countsByStatus["REJECTED"] || 0,
    expired: countsByStatus["EXPIRED"] || 0,
    cancelled: countsByStatus["CANCELLED"] || 0,
    myPermitsCount,
    myPendingApprovalsCount: pendingApprovalsResult.pagination.total,
    expiringSoonCount,
  };

  return {
    permits: permitsResult.data,
    pagination: permitsResult.pagination,
    activePermits,
    expiringPermits,
    myPendingApprovals: pendingApprovalsResult.data,
    summary,
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
  const now = new Date();

  // Authoritatively enforce expiry under row lock before activation
  const didExpire = await enforceAuthoritativeExpiry(id, now);
  if (didExpire || existing.status === "EXPIRED") {
    throw new UnprocessableEntityError("Permit cannot be activated: its validity window has expired.");
  }

  const permitData = toPermitData(existing);
  const check = checkAction(permitData, actor, "ACTIVATE", now);
  assertActionAllowed(check);

  const nextStatus = getNextStatus(existing.status, "ACTIVATE");

  await prisma.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<Array<{ id: string; status: string; expiresAt: Date; version: number }>>`
      SELECT id, status, "expiresAt", version FROM "Permit" WHERE id = ${id} FOR UPDATE
    `;
    if (!locked) throw new NotFoundError("Permit not found.");

    await checkAndApplyTransactionalExpiry(tx, id, locked, now);

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
  const now = new Date();

  // Authoritatively enforce expiry under row lock
  const didExpire = await enforceAuthoritativeExpiry(id, now);
  if (didExpire || existing.status === "EXPIRED") {
    throw new ConflictError("Cannot suspend permit in status 'EXPIRED'. Only ACTIVE permits can be suspended.");
  }

  const permitData = toPermitData(existing);
  const check = checkAction(permitData, actor, "SUSPEND", now);
  assertActionAllowed(check);

  const nextStatus = getNextStatus(existing.status, "SUSPEND");

  await prisma.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<Array<{ id: string; status: string; expiresAt: Date; version: number }>>`
      SELECT id, status, "expiresAt", version FROM "Permit" WHERE id = ${id} FOR UPDATE
    `;
    if (!locked) throw new NotFoundError("Permit not found.");

    await checkAndApplyTransactionalExpiry(tx, id, locked, now);

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
  const now = new Date();

  // Authoritatively enforce expiry under row lock
  const didExpire = await enforceAuthoritativeExpiry(id, now);
  if (didExpire || existing.status === "EXPIRED") {
    throw new UnprocessableEntityError("Permit cannot be resumed: its validity window has expired.");
  }

  const permitData = toPermitData(existing);
  const check = checkAction(permitData, actor, "RESUME", now);
  assertActionAllowed(check);

  const nextStatus = getNextStatus(existing.status, "RESUME");

  await prisma.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<Array<{ id: string; status: string; expiresAt: Date; version: number }>>`
      SELECT id, status, "expiresAt", version FROM "Permit" WHERE id = ${id} FOR UPDATE
    `;
    if (!locked) throw new NotFoundError("Permit not found.");

    await checkAndApplyTransactionalExpiry(tx, id, locked, now);

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
  const now = new Date();

  // Authoritatively enforce expiry under row lock
  const didExpire = await enforceAuthoritativeExpiry(id, now);
  if (didExpire || existing.status === "EXPIRED") {
    throw new ConflictError("Cannot close permit in status 'EXPIRED'. Only ACTIVE permits can be closed.");
  }

  const permitData = toPermitData(existing);
  const check = checkAction(permitData, actor, "CLOSE", now);
  assertActionAllowed(check);

  const nextStatus = getNextStatus(existing.status, "CLOSE");

  await prisma.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<Array<{ id: string; status: string; expiresAt: Date; version: number }>>`
      SELECT id, status, "expiresAt", version FROM "Permit" WHERE id = ${id} FOR UPDATE
    `;
    if (!locked) throw new NotFoundError("Permit not found.");

    await checkAndApplyTransactionalExpiry(tx, id, locked, now);

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

/**
 * Adds a work log entry to an ACTIVE permit.
 *
 * Rules:
 * - Must be ACTIVE
 * - Expired permits rejected (and transitioned to EXPIRED)
 * - Requester, Safety Officer, or Admin authorized
 * - Description cannot be empty
 * - Append-only operational record + audit log
 */
export async function addWorkLog(
  actor: AuthenticatedUser,
  id: string,
  input: LogWorkInput
) {
  if (!input.description || !input.description.trim()) {
    throw new UnprocessableEntityError("Work log description is required.");
  }

  const existing = await loadPermitOrThrow(id);
  const now = new Date();

  // Authoritatively enforce expiry under row lock
  const didExpire = await enforceAuthoritativeExpiry(id, now);
  if (didExpire || existing.status === "EXPIRED") {
    throw new ConflictError(
      "Cannot log work against permit in status 'EXPIRED'. Work logging is permitted only when status is ACTIVE."
    );
  }

  const permitData = toPermitData(existing);
  const check = checkAction(permitData, actor, "LOG_WORK", now);
  assertActionAllowed(check);

  const performedAt = input.performedAt ? new Date(input.performedAt) : now;
  if (isNaN(performedAt.getTime())) {
    throw new UnprocessableEntityError("Invalid performedAt date provided.");
  }
  if (performedAt.getTime() > now.getTime() + 60000) {
    throw new UnprocessableEntityError("Work log timestamp cannot be in the future.");
  }

  const workLog = await prisma.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<Array<{ id: string; status: string; expiresAt: Date; version: number }>>`
      SELECT id, status, "expiresAt", version FROM "Permit" WHERE id = ${id} FOR UPDATE
    `;
    if (!locked) throw new NotFoundError("Permit not found.");

    await checkAndApplyTransactionalExpiry(tx, id, locked, now);

    if (locked.status !== "ACTIVE") {
      throw new ConflictError(
        `Cannot log work against permit in status '${locked.status}'. Work logging is permitted only when status is ACTIVE.`
      );
    }

    const created = await tx.workLogEntry.create({
      data: {
        permitId: id,
        authorId: actor.id,
        description: input.description.trim(),
        performedAt,
      },
      include: {
        author: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    await tx.auditLog.create({
      data: {
        permitId: id,
        ...buildAuditLogData({
          actorId: actor.id,
          actorLabel: actor.name,
          actorRole: actor.role,
          action: "LOG_WORK",
          comment: input.description.trim(),
          metadata: {
            workLogId: created.id,
            performedAt: performedAt.toISOString(),
          },
        }),
      },
    });

    return created;
  });

  return workLog;
}

/**
 * Returns all work logs for a permit in chronological order.
 */
export async function listWorkLogs(permitId: string) {
  await loadPermitOrThrow(permitId);
  return prisma.workLogEntry.findMany({
    where: { permitId },
    orderBy: { performedAt: "asc" },
    include: {
      author: { select: { id: true, name: true, email: true, role: true } },
    },
  });
}

/**
 * Adds an Entry/Exit record to an ACTIVE CONFINED_SPACE_ENTRY permit.
 *
 * Rules:
 * - Only CONFINED_SPACE_ENTRY permits allowed
 * - Must be ACTIVE
 * - Expired permits rejected (and transitioned to EXPIRED)
 * - Row locked FOR UPDATE before checking person's latest entry/exit state (concurrency safe)
 * - Exit cannot precede entry; duplicate consecutive entry/exit rejected
 * - Person cannot exit if not currently inside
 * - Append-only operational record + audit log
 */
export async function addEntryExitLog(
  actor: AuthenticatedUser,
  id: string,
  input: LogEntryExitInput
) {
  if (!input.personName || !input.personName.trim()) {
    throw new UnprocessableEntityError("Person name is required.");
  }
  if (!["ENTRY", "EXIT"].includes(input.direction)) {
    throw new UnprocessableEntityError("Direction must be ENTRY or EXIT.");
  }

  const existing = await loadPermitOrThrow(id);
  const now = new Date();

  // Authoritatively enforce expiry under row lock
  const didExpire = await enforceAuthoritativeExpiry(id, now);
  if (didExpire || existing.status === "EXPIRED") {
    throw new ConflictError(
      "Cannot record entry/exit against permit in status 'EXPIRED'. Entry/exit logging is permitted only when status is ACTIVE."
    );
  }

  const permitData = toPermitData(existing);
  const check = checkAction(permitData, actor, "LOG_ENTRY_EXIT", now);
  assertActionAllowed(check);

  const eventAt = input.at ? new Date(input.at) : now;
  if (isNaN(eventAt.getTime())) {
    throw new UnprocessableEntityError("Invalid event date provided.");
  }
  if (eventAt.getTime() > now.getTime() + 60000) {
    throw new UnprocessableEntityError("Entry/exit timestamp cannot be in the future.");
  }

  const personTrimmed = input.personName.trim();

  const entryExit = await prisma.$transaction(async (tx) => {
    // 1. Lock the permit row BEFORE querying person's latest state to prevent race conditions
    const [locked] = await tx.$queryRaw<Array<{ id: string; status: string; type: string; expiresAt: Date; version: number }>>`
      SELECT id, status, type, "expiresAt", version FROM "Permit" WHERE id = ${id} FOR UPDATE
    `;
    if (!locked) throw new NotFoundError("Permit not found.");

    await checkAndApplyTransactionalExpiry(tx, id, locked, now);

    if (locked.status !== "ACTIVE") {
      throw new ConflictError(
        `Cannot record entry/exit against permit in status '${locked.status}'. Entry/exit logging is permitted only when status is ACTIVE.`
      );
    }

    const def = getPermitType(locked.type);
    if (!def?.hasEntryExitLog) {
      throw new UnprocessableEntityError(
        `Entry/exit logging is not applicable to permit type '${locked.type}'. It is only enabled for Confined Space Entry.`
      );
    }

    // 2. Query person's latest entry/exit record under this lock
    const latest = await tx.entryExitLog.findFirst({
      where: {
        permitId: id,
        personName: { equals: personTrimmed, mode: "insensitive" },
      },
      orderBy: { at: "desc" },
    });

    if (input.direction === "ENTRY") {
      if (latest && latest.direction === "ENTRY") {
        throw new UnprocessableEntityError(
          `"${personTrimmed}" is already recorded as inside the confined space. Cannot record duplicate ENTRY.`
        );
      }
      if (latest && eventAt.getTime() < new Date(latest.at).getTime()) {
        throw new UnprocessableEntityError(
          `Entry timestamp (${eventAt.toISOString()}) cannot precede previous exit timestamp (${new Date(latest.at).toISOString()}).`
        );
      }
    } else {
      // EXIT
      if (!latest || latest.direction !== "ENTRY") {
        throw new UnprocessableEntityError(
          `"${personTrimmed}" is not recorded as inside the confined space. Cannot record EXIT without an active ENTRY.`
        );
      }
      if (eventAt.getTime() < new Date(latest.at).getTime()) {
        throw new UnprocessableEntityError(
          `Exit timestamp (${eventAt.toISOString()}) cannot precede corresponding entry timestamp (${new Date(latest.at).toISOString()}).`
        );
      }
    }

    // 3. Create entry/exit record
    const created = await tx.entryExitLog.create({
      data: {
        permitId: id,
        direction: input.direction,
        personName: personTrimmed,
        at: eventAt,
        recordedById: actor.id,
      },
      include: {
        recordedBy: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    // 4. Create transactional AuditLog
    await tx.auditLog.create({
      data: {
        permitId: id,
        ...buildAuditLogData({
          actorId: actor.id,
          actorLabel: actor.name,
          actorRole: actor.role,
          action: "LOG_ENTRY_EXIT",
          comment: `${input.direction}: ${personTrimmed}`,
          metadata: {
            entryExitId: created.id,
            personName: personTrimmed,
            direction: input.direction,
            at: eventAt.toISOString(),
          },
        }),
      },
    });

    return created;
  });

  return entryExit;
}

/**
 * Returns all entry/exit logs for a permit and the current roster.
 */
export async function listEntryExitLogs(permitId: string) {
  await loadPermitOrThrow(permitId);
  const logs = await prisma.entryExitLog.findMany({
    where: { permitId },
    orderBy: { at: "asc" },
    include: {
      recordedBy: { select: { id: true, name: true, email: true, role: true } },
    },
  });

  const roster = computeConfinedSpaceRoster(logs);

  return {
    logs,
    headcount: roster.headcount,
    currentlyInside: roster.currentlyInside,
  };
}


