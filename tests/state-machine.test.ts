import { describe, it, expect } from "vitest";
import { checkAction } from "../src/domain/state-machine/authorization";
import { getNextStatus } from "../src/domain/state-machine/engine";
import { AuthenticatedUser, PermitData } from "../src/domain/types";

function createMockPermit(overrides: Partial<PermitData> = {}): PermitData {
  const now = new Date();
  const start = new Date(now.getTime() - 1000 * 60 * 10); // 10 mins ago
  const end = new Date(now.getTime() + 1000 * 60 * 60 * 4); // 4 hours from now

  return {
    id: "permit_test_1",
    permitSequence: 1,
    permitNumber: "PTW-2026-0001",
    status: "DRAFT",
    type: "HOT_WORK",
    requesterId: "user_requester",
    contractorTeam: "Mechanical Maintenance Team A",
    workDescription: "Pipe welding on header line",
    equipmentId: "equip_bfp",
    areaId: "area_boiler",
    plantId: "plant_chennai",
    plannedStartTime: start,
    plannedEndTime: end,
    expiresAt: end,
    hazards: ["FLAMMABLE_VAPOR", "HOT_SURFACES"],
    ppeRequired: ["HELMET", "SAFETY_SHOES", "WELDING_SHIELD"],
    precautionsChecklist: {
      fire_watch: true,
      combustibles_cleared: true,
      floor_covered: true,
      gas_tested: true,
    },
    typeData: {
      hotWorkType: "WELDING",
      fireWatchName: "Ramesh Kumar",
      fireExtinguisherType: "CO2 4.5kg",
      combustiblesClearedRadiusMetres: 10,
      gasTestLelPercent: 0,
      gasTestO2Percent: 20.9,
      gasTestTime: new Date().toISOString(),
      gasTesterName: "S. Murugan",
    },
    approvalRound: 1,
    version: 1,
    createdAt: now,
    updatedAt: now,
    area: {
      id: "area_boiler",
      plantId: "plant_chennai",
      code: "AREA-BLR",
      name: "Boiler Area",
      ownerId: "user_area_owner",
    },
    approvals: [],
    ...overrides,
  };
}

describe("Permit State Machine Transitions", () => {
  const requester: AuthenticatedUser = {
    id: "user_requester",
    name: "Ravi Technician",
    email: "requester@opmaint.com",
    role: "REQUESTER",
  };

  const safetyOfficer: AuthenticatedUser = {
    id: "user_safety",
    name: "Dr. Ananya Safety",
    email: "safety@opmaint.com",
    role: "SAFETY_OFFICER",
  };

  it("allows DRAFT -> SUBMIT -> PENDING_APPROVAL by requester", () => {
    const permit = createMockPermit({ status: "DRAFT" });
    const check = checkAction(permit, requester, "SUBMIT");
    expect(check.allowed).toBe(true);
    expect(getNextStatus("DRAFT", "SUBMIT")).toBe("PENDING_APPROVAL");
  });

  it("prevents direct activation from DRAFT (illegal transition)", () => {
    const permit = createMockPermit({ status: "DRAFT" });
    const check = checkAction(permit, requester, "ACTIVATE");
    expect(check.allowed).toBe(false);
    expect(check.httpStatus).toBe(409);
    expect(() => getNextStatus("DRAFT", "ACTIVATE")).toThrow(/Illegal transition/);
  });

  it("handles multi-slot approvals: stays PENDING_APPROVAL on 1st approval, transitions to APPROVED on 2nd", () => {
    // 1st approval by Area Owner
    expect(getNextStatus("PENDING_APPROVAL", "APPROVE", { allApprovalsComplete: false })).toBe("PENDING_APPROVAL");

    // 2nd approval by Safety Officer (all slots complete)
    expect(getNextStatus("PENDING_APPROVAL", "APPROVE", { allApprovalsComplete: true })).toBe("APPROVED");
  });

  it("transitions PENDING_APPROVAL -> REJECTED immediately upon any rejection", () => {
    expect(getNextStatus("PENDING_APPROVAL", "REJECT")).toBe("REJECTED");
  });

  it("transitions APPROVED -> ACTIVE upon activation", () => {
    expect(getNextStatus("APPROVED", "ACTIVATE")).toBe("ACTIVE");
  });

  it("transitions ACTIVE -> SUSPENDED upon suspension, and SUSPENDED -> ACTIVE upon resume", () => {
    expect(getNextStatus("ACTIVE", "SUSPEND")).toBe("SUSPENDED");
    expect(getNextStatus("SUSPENDED", "RESUME")).toBe("ACTIVE");
  });

  it("transitions ACTIVE -> CLOSED upon requester marking work complete", () => {
    expect(getNextStatus("ACTIVE", "CLOSE")).toBe("CLOSED");
  });

  it("transitions CLOSED -> CLOSED_VERIFIED upon safety officer verification", () => {
    expect(getNextStatus("CLOSED", "VERIFY_CLOSURE")).toBe("CLOSED_VERIFIED");
  });

  it("allows cancellation from any non-terminal state", () => {
    const nonTerminalStatuses = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "ACTIVE", "SUSPENDED"] as const;
    for (const status of nonTerminalStatuses) {
      expect(getNextStatus(status, "CANCEL")).toBe("CANCELLED");
    }
  });

  it("blocks any transition from terminal states (REJECTED, EXPIRED, CLOSED_VERIFIED, CANCELLED)", () => {
    const terminalStatuses = ["REJECTED", "EXPIRED", "CLOSED_VERIFIED", "CANCELLED"] as const;
    for (const status of terminalStatuses) {
      const permit = createMockPermit({ status });
      const check = checkAction(permit, safetyOfficer, "ACTIVATE");
      expect(check.allowed).toBe(false);
      expect(check.httpStatus).toBe(409);
    }
  });
});
