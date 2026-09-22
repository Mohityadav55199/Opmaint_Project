import { describe, it, expect } from "vitest";
import { isPastValidity, isExpiringSoon, canStatusExpire, isPermitEligibleForExpiry } from "../src/domain/expiry";
import { detectPermitConflicts } from "../src/domain/conflicts";
import { checkAction, getAvailableActions } from "../src/domain/state-machine/authorization";
import { getNextStatus } from "../src/domain/state-machine/engine";
import { AuthenticatedUser, PermitData, SYSTEM_USER } from "../src/domain/types";

describe("Expiry Semantics and Conflict Detection", () => {
  describe("Authoritative Validity Boundary (expiresAt)", () => {
    it("evaluates validity boundary correctly relative to now", () => {
      const baseTime = new Date("2026-09-22T14:00:00.000Z");

      // Before expiry
      const before = new Date("2026-09-22T13:59:59.000Z");
      expect(isPastValidity({ expiresAt: baseTime }, before)).toBe(false);

      // Exactly at expiry boundary (now >= expiresAt)
      expect(isPastValidity({ expiresAt: baseTime }, baseTime)).toBe(true);

      // After expiry boundary
      const after = new Date("2026-09-22T14:00:01.000Z");
      expect(isPastValidity({ expiresAt: baseTime }, after)).toBe(true);
    });

    it("evaluates isExpiringSoon for ACTIVE permits expiring within 2 hours", () => {
      const now = new Date("2026-09-22T10:00:00.000Z");

      // Active permit expiring in 45 minutes
      const in45Mins = new Date("2026-09-22T10:45:00.000Z");
      expect(isExpiringSoon({ status: "ACTIVE", expiresAt: in45Mins }, now, 2)).toBe(true);

      // Active permit expiring in 3 hours (outside 2h window)
      const in3Hours = new Date("2026-09-22T13:00:00.000Z");
      expect(isExpiringSoon({ status: "ACTIVE", expiresAt: in3Hours }, now, 2)).toBe(false);

      // Non-active permit (e.g. CLOSED or DRAFT) never triggers expiring soon
      expect(isExpiringSoon({ status: "CLOSED", expiresAt: in45Mins }, now, 2)).toBe(false);
      expect(isExpiringSoon({ status: "DRAFT", expiresAt: in45Mins }, now, 2)).toBe(false);
    });
  });

  describe("Spatial-Temporal Conflict Detection", () => {
    it("generates critical warning when Hot Work overlaps in time & area with Confined Space Entry", () => {
      const start = new Date("2026-09-22T08:00:00.000Z");
      const end = new Date("2026-09-22T16:00:00.000Z");

      const candidateHotWork = {
        id: "candidate_1",
        type: "HOT_WORK",
        areaId: "area_storage_tanks",
        equipmentId: "equip_tk_402",
        plannedStartTime: start,
        expiresAt: end,
        status: "PENDING_APPROVAL",
        permitNumber: "PTW-HOT-01",
      };

      const existingConfinedSpace = {
        id: "existing_cs",
        type: "CONFINED_SPACE_ENTRY",
        areaId: "area_storage_tanks",
        equipmentId: "equip_tk_402",
        plannedStartTime: new Date("2026-09-22T10:00:00.000Z"),
        expiresAt: new Date("2026-09-22T14:00:00.000Z"),
        status: "ACTIVE",
        permitNumber: "PTW-CS-88",
      };

      const warnings = detectPermitConflicts(candidateHotWork, [existingConfinedSpace]);
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0].conflictType).toBe("HOT_WORK_VS_CONFINED_SPACE");
      expect(warnings[0].severity).toBe("CRITICAL_WARNING");
      expect(warnings[0].message).toMatch(/Hazardous SIMOPS Conflict/);
    });

    it("generates no warnings when time windows do not overlap", () => {
      const candidate = {
        id: "candidate_morning",
        type: "HOT_WORK",
        areaId: "area_1",
        equipmentId: "equip_1",
        plannedStartTime: new Date("2026-09-22T08:00:00.000Z"),
        expiresAt: new Date("2026-09-22T12:00:00.000Z"),
        status: "PENDING_APPROVAL",
      };

      const nonOverlapping = {
        id: "existing_evening",
        type: "CONFINED_SPACE_ENTRY",
        areaId: "area_1",
        equipmentId: "equip_1",
        plannedStartTime: new Date("2026-09-22T13:00:00.000Z"), // Starts 1h after candidate ends
        expiresAt: new Date("2026-09-22T17:00:00.000Z"),
        status: "ACTIVE",
      };

      const warnings = detectPermitConflicts(candidate, [nonOverlapping]);
      expect(warnings.length).toBe(0);
    });
  });

  describe("Authoritative Expiry Eligibility & System Execution", () => {
    const requester: AuthenticatedUser = {
      id: "user_req_1",
      name: "Ravi Requester",
      email: "ravi@opmaint.local",
      role: "REQUESTER",
    };

    const safetyOfficer: AuthenticatedUser = {
      id: "user_safety_1",
      name: "Safety Officer",
      email: "safety@opmaint.local",
      role: "SAFETY_OFFICER",
    };

    function createMockPermit(status: PermitData["status"], expiresAt: Date): PermitData {
      const now = new Date();
      return {
        id: "permit_exp_1",
        permitSequence: 1,
        permitNumber: "PTW-2026-EXP1",
        status,
        type: "HOT_WORK",
        requesterId: requester.id,
        contractorTeam: "Welding Crew",
        workDescription: "Header pipe repair",
        equipmentId: "equip_101",
        plannedStartTime: new Date(expiresAt.getTime() - 1000 * 60 * 60 * 4),
        plannedEndTime: expiresAt,
        expiresAt,
        hazards: ["HOT_SURFACES"],
        ppeRequired: ["HELMET"],
        precautionsChecklist: { fire_watch: true },
        typeData: {},
        approvalRound: 1,
        version: 1,
        createdAt: now,
        updatedAt: now,
        area: {
          id: "area_1",
          plantId: "plant_1",
          code: "A1",
          name: "Area 1",
          ownerId: "user_ao_1",
        },
        approvals: [],
      };
    }

    it("rule 1: authoritative canStatusExpire agrees across all states", () => {
      // Expirable states
      expect(canStatusExpire("ACTIVE")).toBe(true);
      expect(canStatusExpire("SUSPENDED")).toBe(true);
      expect(canStatusExpire("APPROVED")).toBe(true);
      expect(canStatusExpire("PENDING_APPROVAL")).toBe(true);

      // Non-expirable states
      expect(canStatusExpire("DRAFT")).toBe(false);
      expect(canStatusExpire("REJECTED")).toBe(false);
      expect(canStatusExpire("EXPIRED")).toBe(false);
      expect(canStatusExpire("CLOSED")).toBe(false);
      expect(canStatusExpire("CLOSED_VERIFIED")).toBe(false);
      expect(canStatusExpire("CANCELLED")).toBe(false);
    });

    it("rule 2: isPermitEligibleForExpiry requires both expirable status and now >= expiresAt", () => {
      const now = new Date("2026-09-22T14:00:00.000Z");
      const past = new Date("2026-09-22T13:00:00.000Z");
      const future = new Date("2026-09-22T15:00:00.000Z");

      // ACTIVE in past -> eligible
      expect(isPermitEligibleForExpiry({ status: "ACTIVE", expiresAt: past }, now)).toBe(true);
      // ACTIVE in future -> NOT eligible
      expect(isPermitEligibleForExpiry({ status: "ACTIVE", expiresAt: future }, now)).toBe(false);
      // DRAFT in past -> NOT eligible (DRAFT cannot expire)
      expect(isPermitEligibleForExpiry({ status: "DRAFT", expiresAt: past }, now)).toBe(false);
      // CLOSED in past -> NOT eligible
      expect(isPermitEligibleForExpiry({ status: "CLOSED", expiresAt: past }, now)).toBe(false);
    });

    it("rule 3: normal users are rejected from invoking EXPIRE (403)", () => {
      const now = new Date();
      const past = new Date(now.getTime() - 1000);
      const permit = createMockPermit("ACTIVE", past);

      const reqCheck = checkAction(permit, requester, "EXPIRE", now);
      expect(reqCheck.allowed).toBe(false);
      expect(reqCheck.httpStatus).toBe(403);
      expect(reqCheck.reason).toMatch(/EXPIRE is an automated system transition/);

      const safetyCheck = checkAction(permit, safetyOfficer, "EXPIRE", now);
      expect(safetyCheck.allowed).toBe(false);
      expect(safetyCheck.httpStatus).toBe(403);
    });

    it("rule 4: SYSTEM_USER can expire expirable states when past validity", () => {
      const now = new Date();
      const past = new Date(now.getTime() - 1000);

      for (const status of ["ACTIVE", "SUSPENDED", "APPROVED", "PENDING_APPROVAL"] as const) {
        const permit = createMockPermit(status, past);
        const check = checkAction(permit, SYSTEM_USER, "EXPIRE", now);
        expect(check.allowed).toBe(true);
        expect(getNextStatus(status, "EXPIRE")).toBe("EXPIRED");
      }
    });

    it("rule 5: SYSTEM_USER cannot expire DRAFT or terminal states", () => {
      const now = new Date();
      const past = new Date(now.getTime() - 1000);

      // DRAFT
      const draftPermit = createMockPermit("DRAFT", past);
      const draftCheck = checkAction(draftPermit, SYSTEM_USER, "EXPIRE", now);
      expect(draftCheck.allowed).toBe(false);
      expect(() => getNextStatus("DRAFT", "EXPIRE")).toThrow();

      // Terminal states
      for (const status of ["REJECTED", "CLOSED_VERIFIED", "CANCELLED"] as const) {
        const permit = createMockPermit(status, past);
        const check = checkAction(permit, SYSTEM_USER, "EXPIRE", now);
        expect(check.allowed).toBe(false);
      }
    });

    it("rule 6: EXPIRE is idempotent for already EXPIRED permits", () => {
      const now = new Date();
      const past = new Date(now.getTime() - 1000);
      const expiredPermit = createMockPermit("EXPIRED", past);

      const check = checkAction(expiredPermit, SYSTEM_USER, "EXPIRE", now);
      expect(check.allowed).toBe(true);
      expect(check.httpStatus).toBe(200);
      expect(getNextStatus("EXPIRED", "EXPIRE")).toBe("EXPIRED");
    });

    it("rule 7: EXPIRE is never presented in getAvailableActions()", () => {
      const now = new Date();
      const past = new Date(now.getTime() - 1000);

      for (const status of ["DRAFT", "PENDING_APPROVAL", "APPROVED", "ACTIVE", "SUSPENDED", "CLOSED"] as const) {
        const permit = createMockPermit(status, past);
        expect(getAvailableActions(permit, requester, now)).not.toContain("EXPIRE");
        expect(getAvailableActions(permit, safetyOfficer, now)).not.toContain("EXPIRE");
      }
    });

    it("rule 8: RESUME is refused after expiry on SUSPENDED permits", () => {
      const now = new Date("2026-09-22T15:00:00.000Z");
      const expiredTime = new Date("2026-09-22T14:00:00.000Z");
      const suspendedPermit = createMockPermit("SUSPENDED", expiredTime);

      const resumeCheck = checkAction(suspendedPermit, safetyOfficer, "RESUME", now);
      expect(resumeCheck.allowed).toBe(false);
      expect(resumeCheck.httpStatus).toBe(422);
      expect(resumeCheck.reason).toMatch(/Suspended permit cannot be resumed: validity window has expired/);
    });

    it("rule 9: exact boundary validation for expiry", () => {
      const boundary = new Date("2026-09-22T12:00:00.000Z");
      const permit = createMockPermit("ACTIVE", boundary);

      // 1ms before boundary -> not allowed to expire
      const beforeCheck = checkAction(permit, SYSTEM_USER, "EXPIRE", new Date(boundary.getTime() - 1));
      expect(beforeCheck.allowed).toBe(false);
      expect(beforeCheck.httpStatus).toBe(422);

      // Exactly at boundary -> allowed
      const exactCheck = checkAction(permit, SYSTEM_USER, "EXPIRE", boundary);
      expect(exactCheck.allowed).toBe(true);

      // 1ms after boundary -> allowed
      const afterCheck = checkAction(permit, SYSTEM_USER, "EXPIRE", new Date(boundary.getTime() + 1));
      expect(afterCheck.allowed).toBe(true);
    });
  });
});
