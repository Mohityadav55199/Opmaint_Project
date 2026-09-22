import { describe, it, expect } from "vitest";
import { checkAction } from "../src/domain/state-machine/authorization";
import { AuthenticatedUser, PermitData } from "../src/domain/types";

function createMockPermit(overrides: Partial<PermitData> = {}): PermitData {
  const now = new Date();
  const start = new Date(now.getTime() - 1000 * 60 * 30); // 30 mins ago
  const end = new Date(now.getTime() + 1000 * 60 * 60 * 4); // 4 hours from now

  return {
    id: "permit_auth_test",
    permitSequence: 101,
    permitNumber: "PTW-2026-0101",
    status: "PENDING_APPROVAL",
    type: "HOT_WORK",
    requesterId: "user_requester",
    contractorTeam: "Piping Team 1",
    workDescription: "Hot tap cutting on line 4",
    equipmentId: "equip_pump",
    areaId: "area_boiler",
    plantId: "plant_1",
    plannedStartTime: start,
    plannedEndTime: end,
    expiresAt: end,
    hazards: ["HEAT"],
    ppeRequired: ["HELMET", "GLOVES"],
    precautionsChecklist: {},
    typeData: {
      hotWorkType: "CUTTING",
      fireWatchName: "Deva",
      fireExtinguisherType: "DCP",
      combustiblesClearedRadiusMetres: 10,
      gasTestLelPercent: 0,
      gasTestO2Percent: 20.9,
      gasTestTime: new Date().toISOString(),
      gasTesterName: "Tester A",
    },
    approvalRound: 1,
    version: 1,
    createdAt: now,
    updatedAt: now,
    area: {
      id: "area_boiler",
      plantId: "plant_1",
      code: "BLR",
      name: "Boiler Utilities",
      ownerId: "user_boiler_owner", // Designated Area Owner
    },
    approvals: [],
    ...overrides,
  };
}

describe("Authorization and Approval Slot Rules", () => {
  const requester: AuthenticatedUser = {
    id: "user_requester",
    name: "Ravi Requester",
    email: "requester@opmaint.com",
    role: "REQUESTER",
  };

  const boilerAreaOwner: AuthenticatedUser = {
    id: "user_boiler_owner",
    name: "Suresh Boiler Owner",
    email: "boilerowner@opmaint.com",
    role: "AREA_OWNER",
  };

  const otherAreaOwner: AuthenticatedUser = {
    id: "user_distillation_owner",
    name: "Karthik Distillation Owner",
    email: "distillowner@opmaint.com",
    role: "AREA_OWNER",
  };

  const safetyOfficer: AuthenticatedUser = {
    id: "user_safety_officer",
    name: "Dr. Ananya Safety",
    email: "safety@opmaint.com",
    role: "SAFETY_OFFICER",
  };

  const adminUser: AuthenticatedUser = {
    id: "user_admin",
    name: "System Admin",
    email: "admin@opmaint.com",
    role: "ADMIN",
  };

  describe("Rule 1: Zero Self-Approval (CRITICAL)", () => {
    it("strictly blocks a requester from approving their own permit under any role", () => {
      // Suppose a Safety Officer created a permit (requesterId = user_safety_officer)
      const selfPermit = createMockPermit({ requesterId: safetyOfficer.id });
      const check = checkAction(selfPermit, safetyOfficer, "APPROVE");
      expect(check.allowed).toBe(false);
      expect(check.httpStatus).toBe(403);
      expect(check.reason).toMatch(/Self-approval is strictly forbidden/);
    });

    it("strictly blocks an Admin from approving their own permit if they are the requester", () => {
      const adminSelfPermit = createMockPermit({ requesterId: adminUser.id });
      const check = checkAction(adminSelfPermit, adminUser, "APPROVE");
      expect(check.allowed).toBe(false);
      expect(check.httpStatus).toBe(403);
      expect(check.reason).toMatch(/Self-approval is strictly forbidden/);
    });

    it("rejects approval attempt by regular REQUESTER role with 403", () => {
      const permit = createMockPermit();
      const check = checkAction(permit, requester, "APPROVE");
      expect(check.allowed).toBe(false);
      expect(check.httpStatus).toBe(403);
    });
  });

  describe("Rule 2: Area Owner Boundary", () => {
    it("allows designated Area Owner to approve their area's permit", () => {
      const permit = createMockPermit();
      const check = checkAction(permit, boilerAreaOwner, "APPROVE");
      expect(check.allowed).toBe(true);
      expect(check.eligibleSlots).toContain("AREA_OWNER");
    });

    it("strictly rejects Area Owner from a different area with 403", () => {
      const permit = createMockPermit();
      const check = checkAction(permit, otherAreaOwner, "APPROVE");
      expect(check.allowed).toBe(false);
      expect(check.httpStatus).toBe(403);
      expect(check.reason).toMatch(/assigned area/);
    });
  });

  describe("Rule 3: Dual Slot Prevention", () => {
    it("prevents one person from filling multiple slots in the same round", () => {
      // Suppose Safety Officer approved AREA_OWNER earlier (e.g. as Admin)
      const permit = createMockPermit({
        approvals: [
          {
            id: "app_1",
            permitId: "permit_auth_test",
            round: 1,
            slot: "AREA_OWNER",
            approverId: adminUser.id,
            decision: "APPROVED",
            createdAt: new Date(),
          },
        ],
      });

      // Admin tries to approve the second slot (SAFETY_OFFICER) in the same round
      const check = checkAction(permit, adminUser, "APPROVE");
      expect(check.allowed).toBe(false);
      expect(check.httpStatus).toBe(403);
    });
  });

  describe("Rule 4: Timing Guardrails (Early Activation & Expiry)", () => {
    it("rejects ACTIVATE before planned start time with 422", () => {
      const now = new Date();
      const futureStart = new Date(now.getTime() + 1000 * 60 * 60); // 1 hour in future
      const futureEnd = new Date(now.getTime() + 1000 * 60 * 60 * 5);

      const permit = createMockPermit({
        status: "APPROVED",
        plannedStartTime: futureStart,
        plannedEndTime: futureEnd,
        expiresAt: futureEnd,
        approvals: [
          { id: "1", permitId: "p", round: 1, slot: "AREA_OWNER", approverId: "a", decision: "APPROVED", createdAt: now },
          { id: "2", permitId: "p", round: 1, slot: "SAFETY_OFFICER", approverId: "s", decision: "APPROVED", createdAt: now },
        ],
      });

      const check = checkAction(permit, requester, "ACTIVATE", now);
      expect(check.allowed).toBe(false);
      expect(check.httpStatus).toBe(422);
      expect(check.reason).toMatch(/cannot be activated before its planned start time/);
    });

    it("rejects ACTIVATE after expiresAt with 422", () => {
      const now = new Date();
      const pastStart = new Date(now.getTime() - 1000 * 60 * 60 * 5);
      const pastEnd = new Date(now.getTime() - 1000 * 60 * 10); // Expired 10 mins ago

      const permit = createMockPermit({
        status: "APPROVED",
        plannedStartTime: pastStart,
        plannedEndTime: pastEnd,
        expiresAt: pastEnd,
        approvals: [
          { id: "1", permitId: "p", round: 1, slot: "AREA_OWNER", approverId: "a", decision: "APPROVED", createdAt: now },
          { id: "2", permitId: "p", round: 1, slot: "SAFETY_OFFICER", approverId: "s", decision: "APPROVED", createdAt: now },
        ],
      });

      const check = checkAction(permit, requester, "ACTIVATE", now);
      expect(check.allowed).toBe(false);
      expect(check.httpStatus).toBe(422);
      expect(check.reason).toMatch(/validity window has expired/);
    });

    it("rejects RESUME on a suspended permit if expiresAt has passed with 422", () => {
      const now = new Date();
      const pastEnd = new Date(now.getTime() - 1000 * 60 * 5); // Expired 5 mins ago

      const permit = createMockPermit({
        status: "SUSPENDED",
        expiresAt: pastEnd,
      });

      const check = checkAction(permit, safetyOfficer, "RESUME", now);
      expect(check.allowed).toBe(false);
      expect(check.httpStatus).toBe(422);
      expect(check.reason).toMatch(/validity window has expired/);
    });
  });

  describe("Rule 5: Mandatory Non-Empty Reasons", () => {
    it("rejects whitespace-only rejection reason with 422", () => {
      const permit = createMockPermit();
      const check = checkAction(permit, safetyOfficer, "REJECT", new Date(), { reason: "   " });
      expect(check.allowed).toBe(false);
      expect(check.httpStatus).toBe(422);
      expect(check.reason).toMatch(/mandatory non-empty rejection reason/);
    });

    it("rejects whitespace-only suspension reason with 422", () => {
      const permit = createMockPermit({ status: "ACTIVE" });
      const check = checkAction(permit, safetyOfficer, "SUSPEND", new Date(), { reason: "  \t\n " });
      expect(check.allowed).toBe(false);
      expect(check.httpStatus).toBe(422);
      expect(check.reason).toMatch(/mandatory non-empty suspension reason/);
    });

    it("rejects whitespace-only cancellation reason with 422", () => {
      const permit = createMockPermit({ status: "ACTIVE" });
      const check = checkAction(permit, requester, "CANCEL", new Date(), { reason: "" });
      expect(check.allowed).toBe(false);
      expect(check.httpStatus).toBe(422);
      expect(check.reason).toMatch(/mandatory non-empty cancellation reason/);
    });
  });

  describe("Rule 6: Separation of Duties on Closure Verification", () => {
    it("strictly forbids requester from verifying closure of their own permit", () => {
      // Suppose a Safety Officer was the requester on a permit
      const permit = createMockPermit({
        status: "CLOSED",
        requesterId: safetyOfficer.id,
      });

      const check = checkAction(permit, safetyOfficer, "VERIFY_CLOSURE");
      expect(check.allowed).toBe(false);
      expect(check.httpStatus).toBe(403);
      expect(check.reason).toMatch(/Separation of duties violation/);
    });
  });
});
