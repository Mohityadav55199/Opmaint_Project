import { PermitAction, PermitStatus } from "../types";
import { isValidTransition, isStateTransition } from "./states";

export function getNextStatus(
  currentStatus: PermitStatus,
  action: PermitAction,
  options?: { allApprovalsComplete?: boolean }
): PermitStatus {
  if (!isValidTransition(currentStatus, action)) {
    throw new Error(`Illegal transition: cannot perform action '${action}' from status '${currentStatus}'`);
  }

  // Non-transitioning domain actions preserve the current status
  if (!isStateTransition(action)) {
    return currentStatus;
  }

  switch (action) {
    case "SUBMIT":
      if (currentStatus === "DRAFT") return "PENDING_APPROVAL";
      break;

    case "APPROVE":
      if (currentStatus === "PENDING_APPROVAL") {
        return options?.allApprovalsComplete ? "APPROVED" : "PENDING_APPROVAL";
      }
      break;

    case "REJECT":
      if (currentStatus === "PENDING_APPROVAL") return "REJECTED";
      break;

    case "ACTIVATE":
      if (currentStatus === "APPROVED") return "ACTIVE";
      break;

    case "SUSPEND":
      if (currentStatus === "ACTIVE") return "SUSPENDED";
      break;

    case "RESUME":
      if (currentStatus === "SUSPENDED") return "ACTIVE";
      break;

    case "CLOSE":
      if (currentStatus === "ACTIVE") return "CLOSED";
      break;

    case "VERIFY_CLOSURE":
      if (currentStatus === "CLOSED") return "CLOSED_VERIFIED";
      break;

    case "CANCEL":
      if (["DRAFT", "PENDING_APPROVAL", "APPROVED", "ACTIVE", "SUSPENDED"].includes(currentStatus)) {
        return "CANCELLED";
      }
      break;

    case "EXPIRE":
      if (currentStatus === "EXPIRED") return "EXPIRED";
      if (["PENDING_APPROVAL", "APPROVED", "ACTIVE", "SUSPENDED"].includes(currentStatus)) {
        return "EXPIRED";
      }
      break;
  }

  throw new Error(`Illegal transition: cannot perform action '${action}' from status '${currentStatus}'`);
}

export * from "./states";
export * from "./authorization";
export * from "./payloads";
