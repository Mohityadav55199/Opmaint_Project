import { PermitStatus } from "../types";

export interface ExpirablePermit {
  status: PermitStatus;
  plannedStartTime?: Date;
  plannedEndTime?: Date;
  expiresAt: Date;
}

/**
 * Checks if the current time has reached or passed the authoritative validity boundary (expiresAt).
 * Single source of truth for expiration across API, state machine, and UI.
 */
export function isPastValidity(permit: { expiresAt: Date | string }, now: Date = new Date()): boolean {
  const expires = permit.expiresAt instanceof Date ? permit.expiresAt : new Date(permit.expiresAt);
  return now.getTime() >= expires.getTime();
}

/**
 * Checks if an active permit is expiring within the specified window (default 2 hours).
 * Used for prominent dashboard warnings and urgent badges.
 */
export function isExpiringSoon(
  permit: { status: PermitStatus; expiresAt: Date | string },
  now: Date = new Date(),
  withinHours: number = 2
): boolean {
  if (permit.status !== "ACTIVE") return false;
  const expires = permit.expiresAt instanceof Date ? permit.expiresAt : new Date(permit.expiresAt);
  const nowMs = now.getTime();
  const expiresMs = expires.getTime();
  const windowMs = withinHours * 60 * 60 * 1000;

  return nowMs < expiresMs && expiresMs <= nowMs + windowMs;
}

/**
 * Determines whether a permit in a given status can expire.
 * In accordance with the assignment state machine:
 * - ACTIVE and SUSPENDED explicitly expire.
 * - APPROVED and PENDING_APPROVAL expire if their validity window lapses before activation.
 */
export function canStatusExpire(status: PermitStatus): boolean {
  return ["ACTIVE", "SUSPENDED", "APPROVED", "PENDING_APPROVAL"].includes(status);
}

/**
 * Authoritative single rule for permit expiry eligibility.
 * A permit is eligible for system expiration ONLY when:
 * 1. Its status is in an active/valid workflow state (ACTIVE, SUSPENDED, APPROVED, PENDING_APPROVAL)
 * 2. Current time has reached or passed its authoritative validity boundary (now >= expiresAt).
 */
export function isPermitEligibleForExpiry(
  permit: { status: PermitStatus; expiresAt: Date | string },
  now: Date = new Date()
): boolean {
  return canStatusExpire(permit.status) && isPastValidity(permit, now);
}
