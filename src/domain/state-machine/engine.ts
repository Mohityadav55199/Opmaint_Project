import { PermitAction, PermitStatus } from "../types";

export function getNextStatus(
  currentStatus: PermitStatus,
  action: PermitAction,
  options?: { allApprovalsComplete?: boolean }
): PermitStatus {
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
  }

  throw new Error(`Illegal transition: cannot perform action '${action}' from status '${currentStatus}'`);
}

export * from "./states";
export * from "./authorization";
