import { ApprovalSlot, AuthenticatedUser, PermitAction, PermitData } from "../types";
import { isValidTransition, isTerminalState } from "./states";
import { canUserSatisfySlot, canUserReject, evaluateApprovalSlots, getRequiredSlots } from "../approvals/slots";
import { isPastValidity } from "../expiry";
import { getPermitType, validatePermitTypeData } from "../permit-registry";

export interface ActionCheckResult {
  allowed: boolean;
  reason?: string;
  httpStatus: number; // 200, 400, 403, 404, 409, 422
  eligibleSlots?: ApprovalSlot[];
}

export interface ExtensionSummary {
  approvedCount: number;
  approvedHours: number;
  hasPending: boolean;
}

/**
 * Calculates extension metrics for a permit.
 */
export function getPermitExtensionSummary(permit: PermitData & { extensions?: { status: string; requestedHours: number }[] }): ExtensionSummary {
  const extensions = permit.extensions || [];
  const approved = extensions.filter((e) => e.status === "APPROVED");
  const approvedHours = approved.reduce((sum, e) => sum + e.requestedHours, 0);
  const hasPending = extensions.some((e) => e.status === "PENDING");

  return {
    approvedCount: approved.length,
    approvedHours,
    hasPending,
  };
}

/**
 * Pure authorization and business rule engine.
 * Single source of truth used by API Route Handlers, Services, and UI action bars.
 * Separates Authorization ("May user do this?") from Input Validation ("Is payload valid?").
 */
export function checkAction(
  permit: PermitData,
  user: AuthenticatedUser,
  action: PermitAction,
  now: Date = new Date()
): ActionCheckResult {
  // 1. Verify basic transition validity from current state
  if (!isValidTransition(permit.status, action)) {
    if (isTerminalState(permit.status)) {
      return {
        allowed: false,
        reason: `Permit is in terminal state '${permit.status}' and cannot be modified or transitioned.`,
        httpStatus: 409,
      };
    }
    return {
      allowed: false,
      reason: `Action '${action}' is not permitted from current status '${permit.status}'.`,
      httpStatus: 409,
    };
  }

  // 2. Action-specific RBAC and safety rules
  switch (action) {
    case "SUBMIT": {
      // Requester or Admin only
      if (permit.requesterId !== user.id && user.role !== "ADMIN") {
        return {
          allowed: false,
          reason: "Only the permit requester or an Administrator can submit this permit.",
          httpStatus: 403,
        };
      }

      // Timing check 1: Validity window cannot already have passed
      if (isPastValidity(permit, now)) {
        return {
          allowed: false,
          reason: "Permit validity window has already passed (now >= expiresAt).",
          httpStatus: 422,
        };
      }

      // Timing check 2: plannedStartTime must be strictly earlier than plannedEndTime
      const startTime = new Date(permit.plannedStartTime).getTime();
      const endTime = new Date(permit.plannedEndTime).getTime();
      if (isNaN(startTime) || isNaN(endTime)) {
        return { allowed: false, reason: "Invalid start or end time specified.", httpStatus: 422 };
      }
      if (startTime >= endTime) {
        return {
          allowed: false,
          reason: "Planned start time must be strictly before planned end time.",
          httpStatus: 422,
        };
      }

      // Timing check 3: expiresAt must be consistent with plannedEndTime
      const expiresTime = new Date(permit.expiresAt).getTime();
      if (expiresTime < endTime) {
        return {
          allowed: false,
          reason: "Authoritative expiresAt cannot be earlier than plannedEndTime.",
          httpStatus: 422,
        };
      }

      // Check registry definition
      const def = getPermitType(permit.type);
      if (!def) {
        return {
          allowed: false,
          reason: `Unknown or unregistered permit type: '${permit.type}'.`,
          httpStatus: 422,
        };
      }

      // Timing check 4: Validity duration cannot exceed type maximum validity hours
      const durationHours = (endTime - startTime) / (1000 * 60 * 60);
      if (durationHours > def.maxValidityHours) {
        return {
          allowed: false,
          reason: `Permit validity duration (${durationHours.toFixed(1)}h) exceeds maximum allowed duration for ${def.label} (${def.maxValidityHours}h).`,
          httpStatus: 422,
        };
      }

      // Validate core required fields
      if (!permit.contractorTeam?.trim()) {
        return { allowed: false, reason: "Contractor / Maintenance team is required.", httpStatus: 422 };
      }
      if (!permit.workDescription?.trim()) {
        return { allowed: false, reason: "Work description is required.", httpStatus: 422 };
      }

      // Safety checks: hazards and PPE cannot be empty
      if (!Array.isArray(permit.hazards) || permit.hazards.length === 0) {
        return {
          allowed: false,
          reason: "At least one hazard must be identified for permit submission.",
          httpStatus: 422,
        };
      }
      if (!Array.isArray(permit.ppeRequired) || permit.ppeRequired.length === 0) {
        return {
          allowed: false,
          reason: "Required Personal Protective Equipment (PPE) cannot be empty.",
          httpStatus: 422,
        };
      }

      // Precautions checklist: all mandatory precautions must be checked (true)
      const checklist = permit.precautionsChecklist || {};
      for (const prec of def.defaultPrecautions) {
        if (prec.mandatory && checklist[prec.id] !== true) {
          return {
            allowed: false,
            reason: `Mandatory safety precaution '${prec.label}' must be acknowledged and checked before submission.`,
            httpStatus: 422,
          };
        }
      }

      // Validate type-specific data schema
      const typeValidation = validatePermitTypeData(permit.type, permit.typeData);
      if (!typeValidation.success) {
        return {
          allowed: false,
          reason: `Type-specific safety validation failed: ${typeValidation.errors.join("; ")}`,
          httpStatus: 422,
        };
      }

      return { allowed: true, httpStatus: 200 };
    }

    case "APPROVE": {
      // Requesters can NEVER approve
      if (user.role === "REQUESTER") {
        return {
          allowed: false,
          reason: "Requesters are not authorized to approve permits.",
          httpStatus: 403,
        };
      }

      // CRITICAL: Self-approval forbidden
      if (permit.requesterId === user.id) {
        return {
          allowed: false,
          reason: "Self-approval is strictly forbidden: you cannot approve your own permit.",
          httpStatus: 403,
        };
      }

      // Timing: cannot approve if permit validity window has expired
      if (isPastValidity(permit, now)) {
        return {
          allowed: false,
          reason: "Permit has expired: approvals cannot be granted after the validity window has elapsed.",
          httpStatus: 422,
        };
      }

      const requiredSlots = getRequiredSlots(permit.type);
      const roundStatus = evaluateApprovalSlots(permit);

      // Find unfilled slots this user can satisfy
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
          allowed: false,
          reason:
            user.role === "AREA_OWNER"
              ? "You can only approve permits for equipment in your assigned area, or this slot is already filled."
              : "You do not hold an eligible, unfilled approval slot for this permit.",
          httpStatus: 403,
        };
      }

      return { allowed: true, httpStatus: 200, eligibleSlots };
    }

    case "REJECT": {
      const rejectCheck = canUserReject(user, permit);
      if (!rejectCheck.eligible) {
        return {
          allowed: false,
          reason: rejectCheck.reason || "You are not authorized to reject this permit.",
          httpStatus: 403,
        };
      }

      return { allowed: true, httpStatus: 200, eligibleSlots: rejectCheck.eligibleSlots };
    }

    case "ACTIVATE": {
      // Must be requester (starting work) or Safety Officer or Admin
      if (permit.requesterId !== user.id && user.role !== "SAFETY_OFFICER" && user.role !== "ADMIN") {
        return {
          allowed: false,
          reason: "Only the requester, a Safety Officer, or an Administrator can activate an approved permit.",
          httpStatus: 403,
        };
      }

      // Timing rule 1: Cannot activate before planned start time
      const plannedStart = new Date(permit.plannedStartTime).getTime();
      if (now.getTime() < plannedStart) {
        return {
          allowed: false,
          reason: `Permit cannot be activated before its planned start time (${new Date(permit.plannedStartTime).toISOString()}).`,
          httpStatus: 422,
        };
      }

      // Timing rule 2: Cannot activate after expiry
      if (isPastValidity(permit, now)) {
        return {
          allowed: false,
          reason: "Permit cannot be activated: its validity window has expired.",
          httpStatus: 422,
        };
      }

      // Approvals check: all required approval slots must be filled
      const roundStatus = evaluateApprovalSlots(permit);
      if (!roundStatus.allSlotsFilled) {
        return {
          allowed: false,
          reason: "Cannot activate permit: one or more required approver slots have not yet signed off.",
          httpStatus: 422,
        };
      }

      return { allowed: true, httpStatus: 200 };
    }

    case "SUSPEND": {
      // Only Safety Officer or Admin can suspend
      if (user.role !== "SAFETY_OFFICER" && user.role !== "ADMIN") {
        return {
          allowed: false,
          reason: "Only a Safety Officer or an Administrator has authority to suspend an active permit.",
          httpStatus: 403,
        };
      }

      return { allowed: true, httpStatus: 200 };
    }

    case "RESUME": {
      // Only Safety Officer or Admin can resume
      if (user.role !== "SAFETY_OFFICER" && user.role !== "ADMIN") {
        return {
          allowed: false,
          reason: "Only a Safety Officer or an Administrator can resume a suspended permit.",
          httpStatus: 403,
        };
      }

      // Must not be expired
      if (isPastValidity(permit, now)) {
        return {
          allowed: false,
          reason: "Suspended permit cannot be resumed: validity window has expired.",
          httpStatus: 422,
        };
      }

      return { allowed: true, httpStatus: 200 };
    }

    case "CLOSE": {
      // Only requester or Admin can mark work complete (close)
      if (permit.requesterId !== user.id && user.role !== "ADMIN") {
        return {
          allowed: false,
          reason: "Only the permit requester or an Administrator can mark work complete and close the permit.",
          httpStatus: 403,
        };
      }

      return { allowed: true, httpStatus: 200 };
    }

    case "VERIFY_CLOSURE": {
      // Only Safety Officer or Admin can verify closure
      if (user.role !== "SAFETY_OFFICER" && user.role !== "ADMIN") {
        return {
          allowed: false,
          reason: "Only a Safety Officer or an Administrator can perform closure verification.",
          httpStatus: 403,
        };
      }

      // Separation of duties 1: Requester cannot verify closure of their own permit
      if (permit.requesterId === user.id) {
        return {
          allowed: false,
          reason: "Separation of duties violation: you cannot verify closure of your own permit.",
          httpStatus: 403,
        };
      }

      // Separation of duties 2: Verifier cannot be the person who performed closure
      if (permit.closedById && permit.closedById === user.id) {
        return {
          allowed: false,
          reason: "Separation of duties violation: you cannot verify a closure you performed yourself.",
          httpStatus: 403,
        };
      }

      return { allowed: true, httpStatus: 200 };
    }

    case "CANCEL": {
      // Cancellation rules by state (Point 14)
      if (["DRAFT", "PENDING_APPROVAL", "APPROVED"].includes(permit.status)) {
        // In DRAFT, PENDING_APPROVAL, or APPROVED, requester or Admin can cancel
        if (permit.requesterId !== user.id && user.role !== "ADMIN") {
          return {
            allowed: false,
            reason: "Only the permit requester or an Administrator can cancel permits before work starts.",
            httpStatus: 403,
          };
        }
      } else if (["ACTIVE", "SUSPENDED"].includes(permit.status)) {
        // In ACTIVE or SUSPENDED, cancellation cannot be used to bypass safety closure
        // Only Safety Officer or Admin has authority to cancel active/suspended permits
        if (user.role !== "SAFETY_OFFICER" && user.role !== "ADMIN") {
          return {
            allowed: false,
            reason: "Active or suspended permits may only be cancelled by a Safety Officer or an Administrator to prevent bypassing safety closure inspection.",
            httpStatus: 403,
          };
        }
      } else {
        return {
          allowed: false,
          reason: `Permits in '${permit.status}' status cannot be cancelled.`,
          httpStatus: 409,
        };
      }

      return { allowed: true, httpStatus: 200 };
    }

    case "EDIT": {
      // Edit is only allowed in DRAFT status
      if (permit.status !== "DRAFT") {
        return {
          allowed: false,
          reason: `Permits cannot be edited in status '${permit.status}'. Only DRAFT permits may be edited.`,
          httpStatus: 409,
        };
      }

      if (permit.requesterId !== user.id && user.role !== "ADMIN") {
        return {
          allowed: false,
          reason: "Only the permit requester or an Administrator can edit draft permits.",
          httpStatus: 403,
        };
      }

      return { allowed: true, httpStatus: 200 };
    }

    case "LOG_WORK": {
      if (permit.status !== "ACTIVE") {
        return {
          allowed: false,
          reason: `Work cannot be logged against a permit that is not ACTIVE (current: '${permit.status}').`,
          httpStatus: 409,
        };
      }

      // Requester, Safety Officer, or Admin can log work
      if (permit.requesterId !== user.id && user.role !== "SAFETY_OFFICER" && user.role !== "ADMIN") {
        return {
          allowed: false,
          reason: "Only the permit requester, a Safety Officer, or an Administrator may record work log entries.",
          httpStatus: 403,
        };
      }

      return { allowed: true, httpStatus: 200 };
    }

    case "LOG_ENTRY_EXIT": {
      // Feature flag check: Permit type must have entryExitLog enabled
      const def = getPermitType(permit.type);
      if (!def?.hasEntryExitLog) {
        return {
          allowed: false,
          reason: `Entry/exit logging is not applicable to permit type '${permit.type}'. It is only enabled for types such as Confined Space Entry.`,
          httpStatus: 422,
        };
      }

      // State check: Must be ACTIVE
      if (permit.status !== "ACTIVE") {
        return {
          allowed: false,
          reason: `Entry/exit logging is only permitted when permit is ACTIVE (current: '${permit.status}').`,
          httpStatus: 409,
        };
      }

      return { allowed: true, httpStatus: 200 };
    }

    case "REQUEST_EXTENSION": {
      if (!["ACTIVE", "SUSPENDED"].includes(permit.status)) {
        return {
          allowed: false,
          reason: `Extensions can only be requested on ACTIVE or SUSPENDED permits (current: '${permit.status}').`,
          httpStatus: 409,
        };
      }

      if (permit.requesterId !== user.id && user.role !== "ADMIN") {
        return {
          allowed: false,
          reason: "Only the permit requester or an Administrator can request an extension.",
          httpStatus: 403,
        };
      }

      if (isPastValidity(permit, now)) {
        return {
          allowed: false,
          reason: "Extensions cannot be requested on an already expired permit.",
          httpStatus: 422,
        };
      }

      // Extension rules: max 2 extensions, max 4 total hours, only 1 pending
      const summary = getPermitExtensionSummary(permit);
      if (summary.hasPending) {
        return {
          allowed: false,
          reason: "An extension request is already pending review for this permit.",
          httpStatus: 422,
        };
      }

      if (summary.approvedCount >= 2) {
        return {
          allowed: false,
          reason: "Maximum number of extensions (2) reached for this permit.",
          httpStatus: 422,
        };
      }

      if (summary.approvedHours >= 4) {
        return {
          allowed: false,
          reason: "Maximum cumulative extension duration (4 hours) reached for this permit.",
          httpStatus: 422,
        };
      }

      return { allowed: true, httpStatus: 200 };
    }

    case "APPROVE_EXTENSION":
    case "REJECT_EXTENSION": {
      if (!["ACTIVE", "SUSPENDED"].includes(permit.status)) {
        return {
          allowed: false,
          reason: `Extension decisions are only valid for ACTIVE or SUSPENDED permits (current: '${permit.status}').`,
          httpStatus: 409,
        };
      }

      // Only Safety Officer or Admin
      if (user.role !== "SAFETY_OFFICER" && user.role !== "ADMIN") {
        return {
          allowed: false,
          reason: "Only a Safety Officer or an Administrator may approve or reject extension requests.",
          httpStatus: 403,
        };
      }

      // Requester cannot approve extension
      if (permit.requesterId === user.id) {
        return {
          allowed: false,
          reason: "Separation of duties violation: you cannot review an extension on your own permit.",
          httpStatus: 403,
        };
      }

      return { allowed: true, httpStatus: 200 };
    }

    case "EXPIRE": {
      // System transition: can expire any non-terminal permit whose validity window has passed
      if (isTerminalState(permit.status)) {
        return {
          allowed: false,
          reason: `Permit is already in terminal state '${permit.status}'.`,
          httpStatus: 409,
        };
      }

      if (!isPastValidity(permit, now)) {
        return {
          allowed: false,
          reason: "Permit validity window has not yet expired (now < expiresAt).",
          httpStatus: 422,
        };
      }

      return { allowed: true, httpStatus: 200 };
    }

    default:
      return { allowed: false, reason: `Unsupported action: ${action}`, httpStatus: 400 };
  }
}

/**
 * Returns all actions available to the current user on the given permit.
 * Drives UI button visibility and permissions dynamically.
 */
export function getAvailableActions(
  permit: PermitData,
  user: AuthenticatedUser,
  now: Date = new Date()
): PermitAction[] {
  const actions: PermitAction[] = [
    "SUBMIT",
    "APPROVE",
    "REJECT",
    "ACTIVATE",
    "SUSPEND",
    "RESUME",
    "CLOSE",
    "VERIFY_CLOSURE",
    "CANCEL",
    "EDIT",
    "LOG_WORK",
    "LOG_ENTRY_EXIT",
    "REQUEST_EXTENSION",
    "APPROVE_EXTENSION",
    "REJECT_EXTENSION",
    "EXPIRE",
  ];

  return actions.filter((action) => checkAction(permit, user, action, now).allowed);
}
