import { AuthenticatedUser, PermitAction, PermitData } from "../types";
import { isValidTransition, isTerminalState } from "./states";
import { canUserSatisfySlot, evaluateApprovalSlots, getRequiredSlots } from "../approvals/slots";
import { isPastValidity } from "../expiry";
import { validatePermitTypeData } from "../permit-registry";

export interface ActionCheckResult {
  allowed: boolean;
  reason?: string;
  httpStatus: number; // 400 (Bad Request), 403 (Forbidden), 404 (Not Found), 409 (Conflict/Invalid State), 422 (Unprocessable Entity/Timing)
  eligibleSlots?: ("AREA_OWNER" | "SAFETY_OFFICER")[];
}

/**
 * Pure authorization and business rule engine.
 * Single source of truth used by both API Route Handlers and Frontend Action Bars.
 */
export function checkAction(
  permit: PermitData,
  user: AuthenticatedUser,
  action: PermitAction,
  now: Date = new Date(),
  payload?: { reason?: string; comment?: string; workCompletionNotes?: string; requestedHours?: number }
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

  // 2. Action-specific business & RBAC rules
  switch (action) {
    case "SUBMIT": {
      // Only requester or Admin can submit
      if (permit.requesterId !== user.id && user.role !== "ADMIN") {
        return {
          allowed: false,
          reason: "Only the permit requester or an Administrator can submit this permit.",
          httpStatus: 403,
        };
      }

      // Timing check: cannot submit if window already passed
      if (isPastValidity(permit, now)) {
        return {
          allowed: false,
          reason: "Permit validity window has already passed (now >= expiresAt).",
          httpStatus: 422,
        };
      }

      // Validate required core fields
      if (!permit.contractorTeam?.trim()) {
        return { allowed: false, reason: "Contractor / Maintenance team is required.", httpStatus: 422 };
      }
      if (!permit.workDescription?.trim()) {
        return { allowed: false, reason: "Work description is required.", httpStatus: 422 };
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
      const eligibleSlots: ("AREA_OWNER" | "SAFETY_OFFICER")[] = [];
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
      // Self-approval / self-rejection guard: Must be an authorized approver role
      if (user.role === "REQUESTER") {
        return {
          allowed: false,
          reason: "Requesters cannot reject permits (use Cancel instead).",
          httpStatus: 403,
        };
      }

      // Mandatory reason required (trimmed, non-empty)
      if (payload?.reason !== undefined && !payload.reason.trim()) {
        return {
          allowed: false,
          reason: "A mandatory non-empty rejection reason is required.",
          httpStatus: 422,
        };
      }

      // Area Owner check: must own the area
      if (user.role === "AREA_OWNER" && permit.area?.ownerId !== user.id) {
        return {
          allowed: false,
          reason: "Area Owners can only reject permits for equipment in their assigned area.",
          httpStatus: 403,
        };
      }

      return { allowed: true, httpStatus: 200 };
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
          reason: `Permit cannot be activated before its planned start time (${new Date(permit.plannedStartTime).toLocaleString("en-IN")}).`,
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

      // Mandatory reason required
      if (payload?.reason !== undefined && !payload.reason.trim()) {
        return {
          allowed: false,
          reason: "A mandatory non-empty suspension reason is required (e.g. gas alarm, weather, emergency).",
          httpStatus: 422,
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

      // Completion notes required
      if (payload?.workCompletionNotes !== undefined && !payload.workCompletionNotes.trim()) {
        return {
          allowed: false,
          reason: "Work completion notes and housekeeping confirmation are required to close the permit.",
          httpStatus: 422,
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

      // Separation of duties: Requester cannot verify closure of their own permit
      if (permit.requesterId === user.id) {
        return {
          allowed: false,
          reason: "Separation of duties violation: you cannot verify closure of your own permit.",
          httpStatus: 403,
        };
      }

      return { allowed: true, httpStatus: 200 };
    }

    case "CANCEL": {
      // Requester can cancel own permit; Safety Officer or Admin can cancel any permit
      if (permit.requesterId !== user.id && user.role !== "SAFETY_OFFICER" && user.role !== "ADMIN") {
        return {
          allowed: false,
          reason: "You do not have permission to cancel this permit.",
          httpStatus: 403,
        };
      }

      // Mandatory cancellation reason
      if (payload?.reason !== undefined && !payload.reason.trim()) {
        return {
          allowed: false,
          reason: "A mandatory non-empty cancellation reason is required.",
          httpStatus: 422,
        };
      }

      return { allowed: true, httpStatus: 200 };
    }

    case "REQUEST_EXTENSION": {
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
    "REQUEST_EXTENSION",
  ];

  return actions.filter((action) => checkAction(permit, user, action, now).allowed);
}
