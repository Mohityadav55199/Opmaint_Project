import { describe, it, expect } from "vitest";
import {
  getAllPermitTypes,
  getPermitType,
  validatePermitTypeData,
} from "../src/domain/permit-registry";
import { checkAction } from "../src/domain/state-machine/authorization";
import { getNextStatus } from "../src/domain/state-machine/engine";
import { evaluateApprovalSlots } from "../src/domain/approvals/slots";
import { PermitData } from "../src/domain/types";

describe("Permit Type Registry & Extensibility", () => {
  it("has all 4 core industrial permit types registered by default", () => {
    const types = getAllPermitTypes().map((t) => t.key);
    expect(types).toContain("HOT_WORK");
    expect(types).toContain("CONFINED_SPACE_ENTRY");
    expect(types).toContain("WORKING_AT_HEIGHT");
    expect(types).toContain("ELECTRICAL_ISOLATION_LOTO");
  });

  describe("Validation Rules for Standard Permit Types", () => {
    it("validates Hot Work data and rejects hazardous gas readings (LEL > 0)", () => {
      const validHotWork = {
        hotWorkType: "WELDING",
        fireWatchName: "Ramesh",
        fireExtinguisherType: "CO2",
        combustiblesClearedRadiusMetres: 10,
        gasTestLelPercent: 0,
        gasTestO2Percent: 20.9,
        gasTestTime: new Date().toISOString(),
        gasTesterName: "Tester A",
      };

      expect(validatePermitTypeData("HOT_WORK", validHotWork).success).toBe(true);

      // Gas reading violation
      const unsafeGas = { ...validHotWork, gasTestLelPercent: 2.5 };
      const res = validatePermitTypeData("HOT_WORK", unsafeGas);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.errors[0]).toMatch(/LEL.*reading must be 0%/);
      }
    });

    it("validates Confined Space data and rejects unsafe oxygen levels", () => {
      const validConfined = {
        spaceId: "TK-402",
        entryPoint: "Manhole Top",
        standbyAttendantName: "Gopal",
        rescuePlanDescription: "Tripod winch with safety team on call",
        ventilationMethod: "FORCED_MECHANICAL",
        gasTestO2Percent: 20.9,
        gasTestLelPercent: 0,
        gasTestH2sPpm: 0,
        gasTestCoPpm: 0,
        gasTestTime: new Date().toISOString(),
        gasTesterName: "Tester B",
        communicationMethod: "Radio",
      };

      expect(validatePermitTypeData("CONFINED_SPACE_ENTRY", validConfined).success).toBe(true);

      // Oxygen deficiency
      const oxygenDeficient = { ...validConfined, gasTestO2Percent: 18.0 };
      const res = validatePermitTypeData("CONFINED_SPACE_ENTRY", oxygenDeficient);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.errors[0]).toMatch(/Oxygen level must be between 19.5% and 23.5%/);
      }
    });

    it("validates Working at Height and requires anchor point verification", () => {
      const validHeight = {
        heightMetres: 4.5,
        accessMethod: "SCAFFOLD",
        fallArrestEquipment: "Dual lanyard full body harness",
        anchorPointChecked: true,
        barricadingBelow: true,
        rescuePlanAtHeight: "MEWP prompt rescue",
        weatherCheckConfirmed: true,
      };

      expect(validatePermitTypeData("WORKING_AT_HEIGHT", validHeight).success).toBe(true);

      // Unchecked anchor
      const unverifiedAnchor = { ...validHeight, anchorPointChecked: false };
      expect(validatePermitTypeData("WORKING_AT_HEIGHT", unverifiedAnchor).success).toBe(false);
    });

    it("validates Electrical LOTO and requires zero energy verification", () => {
      const validLoto = {
        equipmentTag: "MCC-01",
        voltageLevel: "415V",
        isolationPointsList: ["Feeder 1", "Control Breaker 2"],
        lockNumbers: ["LK-101"],
        tagNumbers: ["TG-201"],
        earthingApplied: true,
        testedDeadBy: "Electrician Kumar",
        testInstrumentUsed: "Fluke Multimeter",
        zeroEnergyVerified: true,
      };

      expect(validatePermitTypeData("ELECTRICAL_ISOLATION_LOTO", validLoto).success).toBe(true);

      const unverifiedZeroEnergy = { ...validLoto, zeroEnergyVerified: false };
      expect(validatePermitTypeData("ELECTRICAL_ISOLATION_LOTO", unverifiedZeroEnergy).success).toBe(false);
    });
  });

  describe("Extensibility Proof: Dynamic 5th Permit Type (EXCAVATION)", () => {
    it("allows a 5th permit type to be registered and go through create -> submit -> approve -> activate without core changes", () => {
      // 1. Verify EXCAVATION definition is registered
      const excavation = getPermitType("EXCAVATION");
      expect(excavation).toBeDefined();
      expect(excavation?.key).toBe("EXCAVATION");

      // 2. Validate type-specific data
      const excavationData = {
        trenchDepthMetres: 2.5,
        soilType: "TYPE_B_MEDIUM",
        protectiveSystem: "SHIELDING_TRENCH_BOX",
        undergroundUtilitiesScanned: true,
        utilityScanCertificateNumber: "SCAN-2026-99",
        competentPersonName: "Inspector Rajan",
      };
      const validation = validatePermitTypeData("EXCAVATION", excavationData);
      expect(validation.success).toBe(true);

      // 3. Create permit object using generic Permit entity
      const now = new Date();
      const start = new Date(now.getTime() - 1000 * 60 * 10);
      const end = new Date(now.getTime() + 1000 * 60 * 60 * 4);

      const permit: PermitData = {
        id: "permit_excavation_test",
        permitSequence: 501,
        permitNumber: "PTW-2026-0501",
        status: "DRAFT",
        type: "EXCAVATION",
        requesterId: "user_req",
        contractorTeam: "Civil Works Contractor",
        workDescription: "Trenching for stormwater drainage pipe",
        equipmentId: "equip_drain",
        areaId: "area_utilities",
        plantId: "plant_1",
        plannedStartTime: start,
        plannedEndTime: end,
        expiresAt: end,
        hazards: ["CAVE_IN", "UNDERGROUND_SERVICES"],
        ppeRequired: ["HELMET", "SAFETY_BOOTS", "HI_VIS"],
        precautionsChecklist: { utility_clearance: true },
        typeData: excavationData,
        approvalRound: 1,
        version: 1,
        createdAt: now,
        updatedAt: now,
        area: {
          id: "area_utilities",
          plantId: "plant_1",
          code: "UTIL",
          name: "Utilities Area",
          ownerId: "user_util_owner",
        },
        approvals: [],
      };

      const requesterUser = { id: "user_req", name: "Worker", email: "req@test.com", role: "REQUESTER" as const };
      const areaOwnerUser = { id: "user_util_owner", name: "Area Owner", email: "ao@test.com", role: "AREA_OWNER" as const };
      const safetyUser = { id: "user_safety", name: "Safety Off", email: "so@test.com", role: "SAFETY_OFFICER" as const };

      // Step A: Submit
      const submitCheck = checkAction(permit, requesterUser, "SUBMIT", now);
      expect(submitCheck.allowed).toBe(true);
      permit.status = getNextStatus(permit.status, "SUBMIT");
      expect(permit.status).toBe("PENDING_APPROVAL");

      // Step B: Area Owner Approval
      const aoCheck = checkAction(permit, areaOwnerUser, "APPROVE", now);
      expect(aoCheck.allowed).toBe(true);
      permit.approvals?.push({
        id: "app_ao",
        permitId: permit.id,
        round: 1,
        slot: "AREA_OWNER",
        approverId: areaOwnerUser.id,
        decision: "APPROVED",
        createdAt: now,
      });

      // Still PENDING_APPROVAL because Safety Officer slot is not yet signed
      const roundStatus1 = evaluateApprovalSlots(permit);
      expect(roundStatus1.allSlotsFilled).toBe(false);
      permit.status = getNextStatus(permit.status, "APPROVE", { allApprovalsComplete: roundStatus1.allSlotsFilled });
      expect(permit.status).toBe("PENDING_APPROVAL");

      // Step C: Safety Officer Approval
      const soCheck = checkAction(permit, safetyUser, "APPROVE", now);
      expect(soCheck.allowed).toBe(true);
      permit.approvals?.push({
        id: "app_so",
        permitId: permit.id,
        round: 1,
        slot: "SAFETY_OFFICER",
        approverId: safetyUser.id,
        decision: "APPROVED",
        createdAt: now,
      });

      const roundStatus2 = evaluateApprovalSlots(permit);
      expect(roundStatus2.allSlotsFilled).toBe(true);
      permit.status = getNextStatus(permit.status, "APPROVE", { allApprovalsComplete: roundStatus2.allSlotsFilled });
      expect(permit.status).toBe("APPROVED");

      // Step D: Activate
      const activateCheck = checkAction(permit, requesterUser, "ACTIVATE", now);
      expect(activateCheck.allowed).toBe(true);
      permit.status = getNextStatus(permit.status, "ACTIVATE");
      expect(permit.status).toBe("ACTIVE");
    });
  });
});
