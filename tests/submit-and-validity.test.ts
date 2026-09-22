import { describe, it, expect } from "vitest";
import { checkAction } from "../src/domain/state-machine/authorization";
import { AuthenticatedUser, PermitData } from "../src/domain/types";

function createMockSubmitPermit(overrides: Partial<PermitData> = {}): PermitData {
  const now = new Date();
  const start = new Date(now.getTime() + 1000 * 60 * 30); // starts in 30 mins
  const end = new Date(start.getTime() + 1000 * 60 * 60 * 4); // 4 hours duration (HOT_WORK max is 12h)

  return {
    id: "permit_submit_01",
    permitSequence: 1,
    permitNumber: "PTW-2026-0201",
    status: "DRAFT",
    type: "HOT_WORK",
    requesterId: "user_requester",
    contractorTeam: "Piping Fabrication Team",
    workDescription: "Welding replacement flange on main steam header",
    equipmentId: "eq_steam_01",
    plannedStartTime: start,
    plannedEndTime: end,
    expiresAt: end,
    hazards: ["HOT_SURFACES", "SPARKS"],
    ppeRequired: ["HELMET", "WELDING_GLOVES", "EYE_PROTECTION"],
    precautionsChecklist: {
      fire_watch: true,
      combustibles_cleared: true,
      floor_covered: true,
      gas_tested: true,
      ventilation_adequate: true,
    },
    typeData: {
      hotWorkType: "WELDING",
      fireWatchName: "Vikram Rathore",
      fireExtinguisherType: "CO2 4.5kg",
      combustiblesClearedRadiusMetres: 10,
      gasTestLelPercent: 0,
      gasTestO2Percent: 20.9,
      gasTestTime: new Date().toISOString(),
      gasTesterName: "S. Swaminathan",
    },
    approvalRound: 1,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("SUBMIT Validation and Permit Validity Rules", () => {
  const requester: AuthenticatedUser = {
    id: "user_requester",
    name: "Sunil Requester",
    email: "requester@opmaint.local",
    role: "REQUESTER",
  };

  const safetyOfficer: AuthenticatedUser = {
    id: "user_so",
    name: "Safety Lead",
    email: "safety@opmaint.local",
    role: "SAFETY_OFFICER",
  };

  it("submits successfully with valid data and within max validity hours", () => {
    const permit = createMockSubmitPermit();
    const check = checkAction(permit, requester, "SUBMIT");
    expect(check.allowed).toBe(true);
    expect(check.httpStatus).toBe(200);
  });

  it("rejects submission when plannedEndTime is BEFORE plannedStartTime", () => {
    const now = new Date();
    const permit = createMockSubmitPermit({
      plannedStartTime: new Date(now.getTime() + 1000 * 60 * 60 * 4), // 4h from now
      plannedEndTime: new Date(now.getTime() + 1000 * 60 * 60 * 2), // 2h from now
    });

    const check = checkAction(permit, requester, "SUBMIT");
    expect(check.allowed).toBe(false);
    expect(check.httpStatus).toBe(422);
    expect(check.reason).toMatch(/Planned start time must be strictly before planned end time/);
  });

  it("rejects submission when plannedEndTime EQUALS plannedStartTime (zero duration window)", () => {
    const now = new Date();
    const sameTime = new Date(now.getTime() + 1000 * 60 * 60);
    const permit = createMockSubmitPermit({
      plannedStartTime: sameTime,
      plannedEndTime: sameTime,
    });

    const check = checkAction(permit, requester, "SUBMIT");
    expect(check.allowed).toBe(false);
    expect(check.httpStatus).toBe(422);
    expect(check.reason).toMatch(/Planned start time must be strictly before planned end time/);
  });

  it("rejects submission when validity duration exceeds type maxValidityHours", () => {
    // HOT_WORK maxValidityHours is 12
    const now = new Date();
    const start = new Date(now.getTime() + 1000 * 60 * 60);
    const end = new Date(start.getTime() + 1000 * 60 * 60 * 16); // 16 hours duration!
    const permit = createMockSubmitPermit({
      plannedStartTime: start,
      plannedEndTime: end,
      expiresAt: end,
    });

    const check = checkAction(permit, requester, "SUBMIT");
    expect(check.allowed).toBe(false);
    expect(check.httpStatus).toBe(422);
    expect(check.reason).toMatch(/exceeds maximum allowed duration for Hot Work Permit \(12h\)/);
  });

  it("rejects submission when expiresAt is inconsistent with plannedEndTime", () => {
    const now = new Date();
    const start = new Date(now.getTime() + 1000 * 60 * 60);
    const end = new Date(start.getTime() + 1000 * 60 * 60 * 4);
    const invalidExpiresAt = new Date(end.getTime() - 1000 * 60 * 60); // 1h before planned end

    const permit = createMockSubmitPermit({
      plannedStartTime: start,
      plannedEndTime: end,
      expiresAt: invalidExpiresAt,
    });

    const check = checkAction(permit, requester, "SUBMIT");
    expect(check.allowed).toBe(false);
    expect(check.httpStatus).toBe(422);
    expect(check.reason).toMatch(/expiresAt cannot be earlier than plannedEndTime/);
  });

  it("rejects submission when hazards array is empty", () => {
    const permit = createMockSubmitPermit({ hazards: [] });
    const check = checkAction(permit, requester, "SUBMIT");
    expect(check.allowed).toBe(false);
    expect(check.httpStatus).toBe(422);
    expect(check.reason).toMatch(/At least one hazard must be identified/);
  });

  it("rejects submission when PPE array is empty", () => {
    const permit = createMockSubmitPermit({ ppeRequired: [] });
    const check = checkAction(permit, requester, "SUBMIT");
    expect(check.allowed).toBe(false);
    expect(check.httpStatus).toBe(422);
    expect(check.reason).toMatch(/Required Personal Protective Equipment \(PPE\) cannot be empty/);
  });

  it("rejects submission when a mandatory safety precaution is unchecked", () => {
    // In HOT_WORK, fire_watch is mandatory
    const permit = createMockSubmitPermit({
      precautionsChecklist: {
        fire_watch: false, // Unchecked!
        combustibles_cleared: true,
        floor_covered: true,
        gas_tested: true,
      },
    });

    const check = checkAction(permit, requester, "SUBMIT");
    expect(check.allowed).toBe(false);
    expect(check.httpStatus).toBe(422);
    expect(check.reason).toMatch(/Mandatory safety precaution.*must be acknowledged and checked/);
  });

  it("rejects submission for an unknown permit type", () => {
    const permit = createMockSubmitPermit({ type: "UNKNOWN_ALIEN_WORK" });
    const check = checkAction(permit, requester, "SUBMIT");
    expect(check.allowed).toBe(false);
    expect(check.httpStatus).toBe(422);
    expect(check.reason).toMatch(/Unknown or unregistered permit type/);
  });

  it("rejects submission when typeData fails type-specific safety validation (LEL > 0%)", () => {
    const permit = createMockSubmitPermit({
      typeData: {
        hotWorkType: "WELDING",
        fireWatchName: "Vikram Rathore",
        fireExtinguisherType: "CO2 4.5kg",
        combustiblesClearedRadiusMetres: 10,
        gasTestLelPercent: 2.5, // Safety violation: Hot work requires 0% LEL!
        gasTestO2Percent: 20.9,
        gasTestTime: new Date().toISOString(),
        gasTesterName: "S. Swaminathan",
      },
    });

    const check = checkAction(permit, requester, "SUBMIT");
    expect(check.allowed).toBe(false);
    expect(check.httpStatus).toBe(422);
    expect(check.reason).toMatch(/Flammable gas \(LEL\) reading must be 0% for hot work to proceed/);
  });

  it("boundary test: activation at exact plannedStartTime", () => {
    const plannedStart = new Date("2026-09-22T10:00:00.000Z");
    const plannedEnd = new Date("2026-09-22T14:00:00.000Z");

    const approvedPermit = createMockSubmitPermit({
      status: "APPROVED",
      plannedStartTime: plannedStart,
      plannedEndTime: plannedEnd,
      expiresAt: plannedEnd,
      approvals: [
        {
          id: "app_1",
          permitId: "permit_submit_01",
          round: 1,
          slot: "AREA_OWNER",
          approverId: "ao_1",
          decision: "APPROVED",
          createdAt: new Date(),
        },
        {
          id: "app_2",
          permitId: "permit_submit_01",
          round: 1,
          slot: "SAFETY_OFFICER",
          approverId: safetyOfficer.id,
          decision: "APPROVED",
          createdAt: new Date(),
        },
      ],
    });

    // 1 millisecond before plannedStartTime: activation is rejected
    const checkBefore = checkAction(
      approvedPermit,
      requester,
      "ACTIVATE",
      new Date(plannedStart.getTime() - 1)
    );
    expect(checkBefore.allowed).toBe(false);
    expect(checkBefore.reason).toMatch(/cannot be activated before its planned start time/);

    // Exact plannedStartTime: activation is allowed!
    const checkExact = checkAction(
      approvedPermit,
      requester,
      "ACTIVATE",
      plannedStart
    );
    expect(checkExact.allowed).toBe(true);
  });

  it("boundary test: expiry at exact expiresAt", () => {
    const expiresAt = new Date("2026-09-22T18:00:00.000Z");
    const permit = createMockSubmitPermit({
      status: "ACTIVE",
      expiresAt,
    });

    // 1 millisecond before expiresAt: not yet expired
    const checkBefore = checkAction(
      permit,
      safetyOfficer,
      "EXPIRE",
      new Date(expiresAt.getTime() - 1)
    );
    expect(checkBefore.allowed).toBe(false);

    // Exact expiresAt: expired!
    const checkExact = checkAction(
      permit,
      safetyOfficer,
      "EXPIRE",
      expiresAt
    );
    expect(checkExact.allowed).toBe(true);
  });
});
