import { PermitStatus, PermitAction } from "../types";

export const TERMINAL_STATES: readonly PermitStatus[] = [
  "REJECTED",
  "EXPIRED",
  "CLOSED_VERIFIED",
  "CANCELLED",
] as const;

export function isTerminalState(status: PermitStatus): boolean {
  return TERMINAL_STATES.includes(status);
}

export const VALID_TRANSITIONS: Record<PermitStatus, readonly PermitAction[]> = {
  DRAFT: ["SUBMIT", "CANCEL"],
  PENDING_APPROVAL: ["APPROVE", "REJECT", "CANCEL"],
  APPROVED: ["ACTIVATE", "CANCEL"],
  ACTIVE: ["SUSPEND", "CLOSE", "CANCEL", "REQUEST_EXTENSION"],
  SUSPENDED: ["RESUME", "CANCEL"],
  REJECTED: [], // Terminal
  EXPIRED: [], // Terminal
  CLOSED: ["VERIFY_CLOSURE"],
  CLOSED_VERIFIED: [], // Terminal
  CANCELLED: [], // Terminal
} as const;

export function isValidTransition(currentStatus: PermitStatus, action: PermitAction): boolean {
  const allowedActions = VALID_TRANSITIONS[currentStatus];
  return allowedActions ? allowedActions.includes(action) : false;
}
