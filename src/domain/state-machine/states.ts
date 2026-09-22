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

/**
 * State transitions that alter the PermitStatus of a permit.
 */
export const STATE_TRANSITIONS: Record<PermitStatus, readonly PermitAction[]> = {
  DRAFT: ["SUBMIT", "CANCEL"],
  PENDING_APPROVAL: ["APPROVE", "REJECT", "CANCEL"],
  APPROVED: ["ACTIVATE", "CANCEL"],
  ACTIVE: ["SUSPEND", "CLOSE", "CANCEL"],
  SUSPENDED: ["RESUME", "CANCEL"],
  REJECTED: [],
  EXPIRED: [],
  CLOSED: ["VERIFY_CLOSURE"],
  CLOSED_VERIFIED: [],
  CANCELLED: [],
} as const;

/**
 * Non-transitioning domain actions that occur within a status without changing PermitStatus.
 */
export const DOMAIN_ACTIONS: Record<PermitStatus, readonly PermitAction[]> = {
  DRAFT: ["EDIT"],
  PENDING_APPROVAL: [],
  APPROVED: [],
  ACTIVE: ["LOG_WORK", "LOG_ENTRY_EXIT", "REQUEST_EXTENSION", "APPROVE_EXTENSION", "REJECT_EXTENSION"],
  SUSPENDED: ["LOG_WORK", "REQUEST_EXTENSION", "APPROVE_EXTENSION", "REJECT_EXTENSION"],
  REJECTED: [],
  EXPIRED: [],
  CLOSED: [],
  CLOSED_VERIFIED: [],
  CANCELLED: [],
} as const;

/**
 * System transitions triggered automatically (e.g. by time expiration).
 */
export const SYSTEM_TRANSITIONS: readonly PermitAction[] = ["EXPIRE"] as const;

/**
 * Combined canonical mapping of all permitted actions per status.
 */
export const VALID_TRANSITIONS: Record<PermitStatus, readonly PermitAction[]> = {
  DRAFT: [...STATE_TRANSITIONS.DRAFT, ...DOMAIN_ACTIONS.DRAFT, "EXPIRE"],
  PENDING_APPROVAL: [...STATE_TRANSITIONS.PENDING_APPROVAL, ...DOMAIN_ACTIONS.PENDING_APPROVAL, "EXPIRE"],
  APPROVED: [...STATE_TRANSITIONS.APPROVED, ...DOMAIN_ACTIONS.APPROVED, "EXPIRE"],
  ACTIVE: [...STATE_TRANSITIONS.ACTIVE, ...DOMAIN_ACTIONS.ACTIVE, "EXPIRE"],
  SUSPENDED: [...STATE_TRANSITIONS.SUSPENDED, ...DOMAIN_ACTIONS.SUSPENDED, "EXPIRE"],
  REJECTED: [],
  EXPIRED: [],
  CLOSED: [...STATE_TRANSITIONS.CLOSED],
  CLOSED_VERIFIED: [],
  CANCELLED: [],
};

export function isValidTransition(currentStatus: PermitStatus, action: PermitAction): boolean {
  const allowedActions = VALID_TRANSITIONS[currentStatus];
  return allowedActions ? allowedActions.includes(action) : false;
}

export function isStateTransition(action: PermitAction): boolean {
  return !["EDIT", "LOG_WORK", "LOG_ENTRY_EXIT", "REQUEST_EXTENSION", "APPROVE_EXTENSION", "REJECT_EXTENSION"].includes(action);
}
