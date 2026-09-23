import { ApprovalSlot, AuthenticatedUser, PermitData } from "../types";
import { getPermitType } from "../permit-registry";

export interface SlotStatus {
  slot: ApprovalSlot;
  isFilled: boolean;
  approverId?: string;
  approverName?: string;
  comment?: string | null;
  signatureSvg?: string | null;
  approvedAt?: Date;
}

export interface ApprovalRoundStatus {
  round: number;
  requiredSlots: ApprovalSlot[];
  slots: Record<ApprovalSlot, SlotStatus>;
  allSlotsFilled: boolean;
  hasRejection: boolean;
  rejectionReason?: string;
}

/**
 * Evaluates the required approval slots for a permit's type.
 */
export function getRequiredSlots(permitTypeKey: string): ApprovalSlot[] {
  const def = getPermitType(permitTypeKey);
  return def ? def.requiredSlots : ["AREA_OWNER", "SAFETY_OFFICER"];
}

/**
 * Checks whether a specific user is eligible to satisfy a given approval slot for a permit.
 * Strictly enforces:
 * - Zero self-approval: requester cannot approve their own permit under any role.
 * - Area Owner slot must match equipment's authoritative area owner (area.ownerId).
 * - Safety Officer slot requires SAFETY_OFFICER role or ADMIN.
 * - One user cannot fill multiple slots in the same round.
 */
export function canUserSatisfySlot(
  slot: ApprovalSlot,
  user: AuthenticatedUser,
  permit: PermitData
): { eligible: boolean; reason?: string } {
  // CRITICAL RULE: No self-approval under any circumstances
  if (permit.requesterId === user.id) {
    return {
      eligible: false,
      reason: "Self-approval is forbidden: you cannot approve your own permit.",
    };
  }

  // Check if user already filled another slot in this round
  const existingApprovalsThisRound = (permit.approvals || []).filter(
    (a) => a.round === permit.approvalRound && a.decision === "APPROVED"
  );
  const alreadyApprovedOtherSlot = existingApprovalsThisRound.some(
    (a) => a.approverId === user.id && a.slot !== slot
  );
  if (alreadyApprovedOtherSlot) {
    return {
      eligible: false,
      reason: "Dual slot approval forbidden: a single person cannot fill multiple required approval slots.",
    };
  }

  if (slot === "AREA_OWNER") {
    // Area Owner must match the equipment's derived area ownerId
    const areaOwnerId = permit.equipment?.area?.ownerId || permit.area?.ownerId;
    if (!areaOwnerId) {
      return {
        eligible: false,
        reason: "Permit area owner is unassigned or area details could not be resolved.",
      };
    }

    if (user.id !== areaOwnerId) {
      return {
        eligible: false,
        reason: "Area Owner slot can only be approved by the designated owner of this equipment's area.",
      };
    }

    return { eligible: true };
  }

  if (slot === "SAFETY_OFFICER") {
    if (user.role !== "SAFETY_OFFICER" && user.role !== "ADMIN") {
      return {
        eligible: false,
        reason: "Safety Officer slot requires SAFETY_OFFICER or ADMIN credentials.",
      };
    }

    return { eligible: true };
  }

  return { eligible: false, reason: `Unknown approval slot: ${slot}` };
}

/**
 * Checks whether a user may reject a permit.
 * Rejection Semantics:
 * - Must be PENDING_APPROVAL
 * - Requester cannot reject (must use Cancel instead)
 * - User must be eligible to fill a required approval slot that is currently UNFILLED in this round
 * - User must not have already approved another slot in this round
 * - User cannot reject through an already-approved slot
 */
export function canUserReject(
  user: AuthenticatedUser,
  permit: PermitData
): { eligible: boolean; reason?: string; eligibleSlots?: ApprovalSlot[] } {
  if (permit.status !== "PENDING_APPROVAL") {
    return {
      eligible: false,
      reason: `Rejection is only permitted for permits in 'PENDING_APPROVAL' status (current: '${permit.status}').`,
    };
  }

  // Requester cannot reject
  if (permit.requesterId === user.id) {
    return {
      eligible: false,
      reason: "Requesters cannot reject permits (use Cancel instead).",
    };
  }

  const requiredSlots = getRequiredSlots(permit.type);
  const roundStatus = evaluateApprovalSlots(permit);

  // If already rejected in this round
  if (roundStatus.hasRejection) {
    return {
      eligible: false,
      reason: "This permit round has already been rejected.",
    };
  }

  // Find unfilled required slots this user can satisfy
  const eligibleSlots: ApprovalSlot[] = [];
  for (const slot of requiredSlots) {
    if (!roundStatus.slots[slot]?.isFilled) {
      const check = canUserSatisfySlot(slot, user, permit);
      if (check.eligible) {
        eligibleSlots.push(slot);
      }
    }
  }

  if (eligibleSlots.length === 0) {
    return {
      eligible: false,
      reason:
        user.role === "AREA_OWNER"
          ? "You can only reject permits for equipment in your assigned area, or your slot is already filled."
          : "You do not hold an eligible, unfilled approval slot to reject this permit.",
    };
  }

  return { eligible: true, eligibleSlots };
}


/**
 * Evaluates the completion of all required approval slots for the current round.
 */
export function evaluateApprovalSlots(permit: PermitData): ApprovalRoundStatus {
  const requiredSlots = getRequiredSlots(permit.type);
  const currentRound = permit.approvalRound;

  const currentApprovals = (permit.approvals || []).filter((a) => a.round === currentRound);

  const slotMap: Record<ApprovalSlot, SlotStatus> = {
    AREA_OWNER: { slot: "AREA_OWNER", isFilled: false },
    SAFETY_OFFICER: { slot: "SAFETY_OFFICER", isFilled: false },
  };

  let hasRejection = false;
  let rejectionReason: string | undefined;

  for (const app of currentApprovals) {
    if (app.decision === "REJECTED") {
      hasRejection = true;
      rejectionReason = app.comment || "Rejected by approver";
    }

    if (app.decision === "APPROVED") {
      slotMap[app.slot] = {
        slot: app.slot,
        isFilled: true,
        approverId: app.approverId,
        comment: app.comment,
        signatureSvg: app.signatureSvg,
        approvedAt: app.createdAt,
      };
    }
  }

  const allSlotsFilled = requiredSlots.every((slot) => slotMap[slot]?.isFilled);

  return {
    round: currentRound,
    requiredSlots,
    slots: slotMap,
    allSlotsFilled,
    hasRejection,
    rejectionReason,
  };
}

/**
 * Returns all unfilled required approval slots that the authenticated user is currently eligible to satisfy.
 * Uses canUserSatisfySlot as the single source of truth.
 */
export function getUserEligibleApprovalSlots(
  user: AuthenticatedUser,
  permit: PermitData
): ApprovalSlot[] {
  if (permit.status !== "PENDING_APPROVAL") return [];
  if (permit.requesterId === user.id) return []; // Self-approval prohibited

  const requiredSlots = getRequiredSlots(permit.type);
  const roundStatus = evaluateApprovalSlots(permit);
  if (roundStatus.hasRejection) return [];

  const eligible: ApprovalSlot[] = [];
  for (const slot of requiredSlots) {
    if (!roundStatus.slots[slot]?.isFilled) {
      const check = canUserSatisfySlot(slot, user, permit);
      if (check.eligible) {
        eligible.push(slot);
      }
    }
  }
  return eligible;
}

/**
 * Checks whether a user has an active, unfilled approval obligation for this permit in the current round.
 * Reuses getUserEligibleApprovalSlots and canUserSatisfySlot as the sole source of truth.
 */
export function hasUserPendingApprovalObligation(
  user: AuthenticatedUser,
  permit: PermitData
): boolean {
  return getUserEligibleApprovalSlots(user, permit).length > 0;
}
