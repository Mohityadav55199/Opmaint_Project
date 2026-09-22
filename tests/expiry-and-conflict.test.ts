import { describe, it, expect } from "vitest";
import { isPastValidity, isExpiringSoon } from "../src/domain/expiry";
import { detectPermitConflicts } from "../src/domain/conflicts";

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
});
