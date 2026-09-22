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
    const areaOwnerId = permit.area?.ownerId;
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
