import { describe, it, expect } from "vitest";
import { checkAction, getAvailableActions } from "../src/domain/state-machine/authorization";
import { canUserReject } from "../src/domain/approvals/slots";
import { AuthenticatedUser, PermitData } from "../src/domain/types";

function createMockPermit(overrides: Partial<PermitData> = {}): PermitData {
  const now = new Date();
  const start = new Date(now.getTime() - 1000 * 60 * 30); // 30 mins ago
  const end = new Date(now.getTime() + 1000 * 60 * 60 * 4); // 4 hours from now

  return {
    id: "permit_test_101",
    permitSequence: 1,
    permitNumber: "PTW-2026-0101",
    status: "PENDING_APPROVAL",
    type: "HOT_WORK",
    requesterId: "user_requester",
    contractorTeam: "Boiler Maintenance Team Alpha",
    workDescription: "Hot tap welding on pipeline",
    equipmentId: "eq_boiler_1",
    plannedStartTime: start,
    plannedEndTime: end,
    expiresAt: end,
    hazards: ["HOT_SURFACES", "FLAMMABLE_GAS"],
    ppeRequired: ["HELMET", "LEATHER_GLOVES", "SAFETY_SHOES"],
    precautionsChecklist: {
      fire_watch: true,
      combustibles_cleared: true,
      floor_covered: true,
      gas_tested: true,
    },
    typeData: {
      hotWorkType: "WELDING",
      fireWatchName: "Ramesh FireWatch",
      fireExtinguisherType: "CO2 4.5kg",
      combustiblesClearedRadiusMetres: 10,
      gasTestLelPercent: 0,
      gasTestO2Percent: 20.8,
      gasTestTime: new Date().toISOString(),
      gasTesterName: "Authorized Gas Tester",
    },
    approvalRound: 1,
    version: 1,
    createdAt: now,
    updatedAt: now,
    area: {
      id: "area_boiler",
      plantId: "plant_pune",
      code: "AREA_BLR",
      name: "Boiler House",
      ownerId: "user_area_owner_boiler",
    },
    approvals: [],
    ...overrides,
  };
}

describe("RBAC and Approval Slots Engine", () => {
  const requester: AuthenticatedUser = {
    id: "user_requester",
    name: "Sunil Requester",
    email: "requester@opmaint.local",
    role: "REQUESTER",
  };

  const boilerAreaOwner: AuthenticatedUser = {
    id: "user_area_owner_boiler",
    name: "Ramesh Area Owner",
    email: "ao.boiler@opmaint.local",
    role: "AREA_OWNER",
  };

  const turbineAreaOwner: AuthenticatedUser = {
    id: "user_area_owner_turbine",
    name: "Suresh Turbine Owner",
    email: "ao.turbine@opmaint.local",
    role: "AREA_OWNER",
  };

  const safetyOfficer: AuthenticatedUser = {
    id: "user_safety_officer",
    name: "Dr. Kulkarni Safety",
    email: "safety@opmaint.local",
    role: "SAFETY_OFFICER",
  };

  const admin: AuthenticatedUser = {
    id: "user_admin",
    name: "System Admin",
    email: "admin@opmaint.local",
    role: "ADMIN",
  };

  describe("Rule 1: Zero Self-Approval", () => {
    it("strictly forbids requester from approving their own permit under any role", () => {
      const permit = createMockPermit({ requesterId: boilerAreaOwner.id });
      const check = checkAction(permit, boilerAreaOwner, "APPROVE");
      expect(check.allowed).toBe(false);
      expect(check.httpStatus).toBe(403);
      expect(check.reason).toMatch(/Self-approval is strictly forbidden/);
    });

    it("forbids Admin from approving if Admin was the requester", () => {
      const permit = createMockPermit({ requesterId: admin.id });
      const check = checkAction(permit, admin, "APPROVE");
      expect(check.allowed).toBe(false);
      expect(check.httpStatus).toBe(403);
      expect(check.reason).toMatch(/Self-approval is strictly forbidden/);
    });
  });

  describe("Rule 2: Authoritative Area Ownership Boundaries", () => {
    it("allows the designated owner of the equipment's area to approve AREA_OWNER slot", () => {
      const permit = createMockPermit();
      const check = checkAction(permit, boilerAreaOwner, "APPROVE");
      expect(check.allowed).toBe(true);
      expect(check.eligibleSlots).toContain("AREA_OWNER");
    });

    it("rejects an Area Owner of a different area (e.g. Turbine owner approving Boiler equipment)", () => {
      const permit = createMockPermit();
      const check = checkAction(permit, turbineAreaOwner, "APPROVE");
      expect(check.allowed).toBe(false);
      expect(check.httpStatus).toBe(403);
      expect(check.reason).toMatch(/only approve permits for equipment in your assigned area/);
    });
  });

  describe("Rule 3: One Approver Cannot Fill Multiple Slots in Same Round", () => {
    it("prevents an approver who already approved AREA_OWNER from also approving SAFETY_OFFICER slot", () => {
      const userDualRole: AuthenticatedUser = {
        id: "user_dual_capable",
        name: "Dual Capable Lead",
        email: "dual@opmaint.local",
        role: "ADMIN", // Admin has technical permission for Safety Officer
      };

      const permit = createMockPermit({
        area: {
          id: "area_boiler",
          plantId: "plant_pune",
          code: "AREA_BLR",
          name: "Boiler House",
          ownerId: userDualRole.id, // User is also Area Owner
        },
        approvals: [
          {
            id: "app_1",
            permitId: "permit_test_101",
            round: 1,
            slot: "AREA_OWNER",
            approverId: userDualRole.id,
            decision: "APPROVED",
            createdAt: new Date(),
          },
        ],
      });

      const check = checkAction(permit, userDualRole, "APPROVE");
      expect(check.allowed).toBe(false);
      expect(check.httpStatus).toBe(403);
    });
  });

  describe("Rule 4: Multi-Slot Completion & Activation Guards", () => {
    it("blocks activation when only 1 of 2 required slots has approved", () => {
      const permit = createMockPermit({
        status: "APPROVED", // supposed state
        approvals: [
          {
            id: "app_1",
            permitId: "permit_test_101",
            round: 1,
            slot: "AREA_OWNER",
            approverId: boilerAreaOwner.id,
            decision: "APPROVED",
            createdAt: new Date(),
          },
        ],
      });

      const check = checkAction(permit, requester, "ACTIVATE");
      expect(check.allowed).toBe(false);
      expect(check.httpStatus).toBe(422);
      expect(check.reason).toMatch(/one or more required approver slots have not yet signed off/);
    });

    it("allows activation when all required slots (AREA_OWNER + SAFETY_OFFICER) have signed off", () => {
      const permit = createMockPermit({
        status: "APPROVED",
        approvals: [
          {
            id: "app_1",
            permitId: "permit_test_101",
            round: 1,
            slot: "AREA_OWNER",
            approverId: boilerAreaOwner.id,
            decision: "APPROVED",
            createdAt: new Date(),
          },
          {
            id: "app_2",
            permitId: "permit_test_101",
            round: 1,
            slot: "SAFETY_OFFICER",
            approverId: safetyOfficer.id,
            decision: "APPROVED",
            createdAt: new Date(),
          },
        ],
      });

      const check = checkAction(permit, requester, "ACTIVATE");
      expect(check.allowed).toBe(true);
      expect(check.httpStatus).toBe(200);
    });
  });

  describe("Rule 5: Rejection Semantics & Eligibility", () => {
    it("allows eligible Area Owner to reject an unfilled slot", () => {
      const permit = createMockPermit();
      const check = checkAction(permit, boilerAreaOwner, "REJECT");
      expect(check.allowed).toBe(true);
      expect(check.eligibleSlots).toContain("AREA_OWNER");
    });

    it("allows eligible Safety Officer to reject an unfilled slot", () => {
      const permit = createMockPermit();
      const check = checkAction(permit, safetyOfficer, "REJECT");
      expect(check.allowed).toBe(true);
      expect(check.eligibleSlots).toContain("SAFETY_OFFICER");
    });

    it("denies requester from rejecting their own permit (must use CANCEL instead)", () => {
      const permit = createMockPermit();
      const check = checkAction(permit, requester, "REJECT");
      expect(check.allowed).toBe(false);
      expect(check.httpStatus).toBe(403);
      expect(check.reason).toMatch(/Requesters cannot reject/);
    });

    it("denies Area Owner from rejecting through an already-approved Area Owner slot", () => {
      const permit = createMockPermit({
        approvals: [
          {
            id: "app_1",
            permitId: "permit_test_101",
            round: 1,
            slot: "AREA_OWNER",
            approverId: boilerAreaOwner.id,
            decision: "APPROVED",
            createdAt: new Date(),
          },
        ],
      });

      // Area Owner slot is already approved; boilerAreaOwner cannot reject
      const check = checkAction(permit, boilerAreaOwner, "REJECT");
      expect(check.allowed).toBe(false);
      expect(check.httpStatus).toBe(403);
    });

    it("denies approver who already approved another slot in the round from rejecting", () => {
      const permit = createMockPermit({
        approvals: [
          {
            id: "app_1",
            permitId: "permit_test_101",
            round: 1,
            slot: "AREA_OWNER",
            approverId: admin.id,
            decision: "APPROVED",
            createdAt: new Date(),
          },
        ],
      });

      // Admin already filled AREA_OWNER, so cannot reject SAFETY_OFFICER slot in same round
      const check = checkAction(permit, admin, "REJECT");
      expect(check.allowed).toBe(false);
      expect(check.httpStatus).toBe(403);
    });

    it("handles duplicate/concurrent rejection cleanly", () => {
      const permit = createMockPermit({
        approvals: [
          {
            id: "app_1",
            permitId: "permit_test_101",
            round: 1,
            slot: "AREA_OWNER",
            approverId: boilerAreaOwner.id,
            decision: "REJECTED",
            comment: "Already rejected",
            createdAt: new Date(),
          },
        ],
      });

      const rejectCheck = canUserReject(safetyOfficer, permit);
      expect(rejectCheck.eligible).toBe(false);
      expect(rejectCheck.reason).toMatch(/already been rejected/);
    });
  });

  describe("Rule 6: Separation of Duties on Closure Verification", () => {
    it("strictly forbids requester from verifying closure of their own permit", () => {
      const permit = createMockPermit({
        status: "CLOSED",
        requesterId: safetyOfficer.id,
      });

      const check = checkAction(permit, safetyOfficer, "VERIFY_CLOSURE");
      expect(check.allowed).toBe(false);
      expect(check.httpStatus).toBe(403);
      expect(check.reason).toMatch(/Separation of duties violation: you cannot verify closure of your own permit/);
    });

    it("strictly forbids the person who closed the permit (closedById) from verifying closure", () => {
      const permit = createMockPermit({
        status: "CLOSED",
        requesterId: requester.id,
        closedById: safetyOfficer.id, // Safety officer closed it
      });

      const check = checkAction(permit, safetyOfficer, "VERIFY_CLOSURE");
      expect(check.allowed).toBe(false);
      expect(check.httpStatus).toBe(403);
      expect(check.reason).toMatch(/cannot verify a closure you performed yourself/);
    });

    it("allows an independent Safety Officer or Admin to verify closure", () => {
      const permit = createMockPermit({
        status: "CLOSED",
        requesterId: requester.id,
        closedById: requester.id,
      });

      const check = checkAction(permit, safetyOfficer, "VERIFY_CLOSURE");
      expect(check.allowed).toBe(true);
      expect(check.httpStatus).toBe(200);
    });
  });

  describe("Rule 7: Cancellation by State & Role", () => {
    it("allows requester to cancel in DRAFT, PENDING_APPROVAL, and APPROVED", () => {
      for (const status of ["DRAFT", "PENDING_APPROVAL", "APPROVED"] as const) {
        const permit = createMockPermit({ status });
        const check = checkAction(permit, requester, "CANCEL");
        expect(check.allowed).toBe(true);
      }
    });

    it("denies requester from cancelling in ACTIVE and SUSPENDED status (safety closure required)", () => {
      for (const status of ["ACTIVE", "SUSPENDED"] as const) {
        const permit = createMockPermit({ status });
        const check = checkAction(permit, requester, "CANCEL");
        expect(check.allowed).toBe(false);
        expect(check.httpStatus).toBe(403);
        expect(check.reason).toMatch(/may only be cancelled by a Safety Officer or an Administrator/);
      }
    });

    it("allows Safety Officer or Admin to cancel an ACTIVE or SUSPENDED permit", () => {
      for (const status of ["ACTIVE", "SUSPENDED"] as const) {
        const permit = createMockPermit({ status });
        expect(checkAction(permit, safetyOfficer, "CANCEL").allowed).toBe(true);
        expect(checkAction(permit, admin, "CANCEL").allowed).toBe(true);
      }
    });
  });

  describe("Rule 8: Non-Transitioning Domain Actions (EDIT, LOG_WORK, LOG_ENTRY_EXIT, EXTENSION)", () => {
    it("EDIT: allowed only in DRAFT status by requester or Admin", () => {
      const draftPermit = createMockPermit({ status: "DRAFT" });
      expect(checkAction(draftPermit, requester, "EDIT").allowed).toBe(true);
      expect(checkAction(draftPermit, admin, "EDIT").allowed).toBe(true);
      expect(checkAction(draftPermit, boilerAreaOwner, "EDIT").allowed).toBe(false);

      const activePermit = createMockPermit({ status: "ACTIVE" });
      expect(checkAction(activePermit, requester, "EDIT").allowed).toBe(false);
    });

    it("LOG_WORK: allowed in ACTIVE and SUSPENDED status", () => {
      const activePermit = createMockPermit({ status: "ACTIVE" });
      expect(checkAction(activePermit, requester, "LOG_WORK").allowed).toBe(true);
      expect(checkAction(activePermit, safetyOfficer, "LOG_WORK").allowed).toBe(true);

      const draftPermit = createMockPermit({ status: "DRAFT" });
      expect(checkAction(draftPermit, requester, "LOG_WORK").allowed).toBe(false);
    });

    it("LOG_ENTRY_EXIT: allowed only for permit types with hasEntryExitLog (Confined Space) and when ACTIVE", () => {
      const hotWorkPermit = createMockPermit({ status: "ACTIVE", type: "HOT_WORK" });
      const checkHotWork = checkAction(hotWorkPermit, safetyOfficer, "LOG_ENTRY_EXIT");
      expect(checkHotWork.allowed).toBe(false);
      expect(checkHotWork.reason).toMatch(/Entry\/exit logging is not applicable to permit type 'HOT_WORK'/);

      const confinedSpacePermit = createMockPermit({ status: "ACTIVE", type: "CONFINED_SPACE_ENTRY" });
      const checkConfined = checkAction(confinedSpacePermit, safetyOfficer, "LOG_ENTRY_EXIT");
      expect(checkConfined.allowed).toBe(true);
    });

    it("REQUEST_EXTENSION: enforces max 2 extensions, max 4h total, and no pending extension", () => {
      const activePermit = createMockPermit({ status: "ACTIVE" });
      expect(checkAction(activePermit, requester, "REQUEST_EXTENSION").allowed).toBe(true);

      // Denied if already has a pending extension
      const permitWithPending = createMockPermit({
        status: "ACTIVE",
        extensions: [{ status: "PENDING", requestedHours: 2 }],
      });
      const checkPending = checkAction(permitWithPending, requester, "REQUEST_EXTENSION");
      expect(checkPending.allowed).toBe(false);
      expect(checkPending.reason).toMatch(/already pending review/);

      // Denied if already approved 2 extensions
      const permitMaxCount = createMockPermit({
        status: "ACTIVE",
        extensions: [
          { status: "APPROVED", requestedHours: 1 },
          { status: "APPROVED", requestedHours: 1 },
        ],
      });
      const checkCount = checkAction(permitMaxCount, requester, "REQUEST_EXTENSION");
      expect(checkCount.allowed).toBe(false);
      expect(checkCount.reason).toMatch(/Maximum number of extensions \(2\) reached/);

      // Denied if already reached 4 hours
      const permitMaxHours = createMockPermit({
        status: "ACTIVE",
        extensions: [{ status: "APPROVED", requestedHours: 4 }],
      });
      const checkHours = checkAction(permitMaxHours, requester, "REQUEST_EXTENSION");
      expect(checkHours.allowed).toBe(false);
      expect(checkHours.reason).toMatch(/Maximum cumulative extension duration \(4 hours\) reached/);
    });
  });

  describe("Rule 9: EXPIRE System Transition", () => {
    it("allows EXPIRE on non-terminal permit only when now >= expiresAt", () => {
      const now = new Date();
      const pastPermit = createMockPermit({
        status: "ACTIVE",
        expiresAt: new Date(now.getTime() - 1000), // Expired 1 second ago
      });
      expect(checkAction(pastPermit, safetyOfficer, "EXPIRE", now).allowed).toBe(true);

      const activePermit = createMockPermit({
        status: "ACTIVE",
        expiresAt: new Date(now.getTime() + 1000 * 60 * 60), // Valid for 1 more hour
      });
      const checkNotExpired = checkAction(activePermit, safetyOfficer, "EXPIRE", now);
      expect(checkNotExpired.allowed).toBe(false);
      expect(checkNotExpired.httpStatus).toBe(422);
    });
  });

  describe("Rule 10: getAvailableActions dynamically evaluates all actions without dummy payloads", () => {
    it("returns exactly expected actions for requester on ACTIVE permit", () => {
      const permit = createMockPermit({ status: "ACTIVE" });
      const actions = getAvailableActions(permit, requester);

      expect(actions).toContain("CLOSE");
      expect(actions).toContain("LOG_WORK");
      expect(actions).toContain("REQUEST_EXTENSION");
      // Requester cannot cancel ACTIVE permit
      expect(actions).not.toContain("CANCEL");
      // Requester cannot approve
      expect(actions).not.toContain("APPROVE");
    });
  });
});
