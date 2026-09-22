import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  getAllPermitTypes,
  getPermitType,
  registerPermitType,
  unregisterPermitType,
  validatePermitTypeData,
  validateRegistryFormDrift,
  PermitTypeDefinition,
  hotWorkDefinition,
  confinedSpaceDefinition,
  workingAtHeightDefinition,
  electricalLotoDefinition,
  excavationDefinition,
} from "../src/domain/permit-registry";
import { checkAction } from "../src/domain/state-machine/authorization";
import { getNextStatus } from "../src/domain/state-machine/engine";
import { evaluateApprovalSlots } from "../src/domain/approvals/slots";
import { PermitData } from "../src/domain/types";

describe("Permit Type Registry & Extensibility", () => {
  it("has all 5 standard industrial permit types registered by default", () => {
    const types = getAllPermitTypes().map((t) => t.key);
    expect(types).toContain("HOT_WORK");
    expect(types).toContain("CONFINED_SPACE_ENTRY");
    expect(types).toContain("WORKING_AT_HEIGHT");
    expect(types).toContain("ELECTRICAL_ISOLATION_LOTO");
    expect(types).toContain("EXCAVATION");
  });

  describe("Duplicate Registration Guard", () => {
    it("throws an explicit error when attempting to register an already-registered permit type key", () => {
      expect(() => registerPermitType(hotWorkDefinition)).toThrow(
        /Permit type 'HOT_WORK' is already registered in PermitTypeRegistry/
      );
    });
  });

  describe("Form Configuration & Schema Drift Detection", () => {
    it("verifies that all default permit types have zero schema-form drift", () => {
      const defaultDefinitions = [
        hotWorkDefinition,
        confinedSpaceDefinition,
        workingAtHeightDefinition,
        electricalLotoDefinition,
        excavationDefinition,
      ];

      for (const def of defaultDefinitions) {
        const check = validateRegistryFormDrift(def);
        expect(check.valid).toBe(true);
        expect(check.errors).toEqual([]);
      }
    });

    it("detects when a form field does not exist in the Zod schema", () => {
      const dummyDriftDef: PermitTypeDefinition = {
        key: "TEST_DRIFT_EXTRA_FIELD",
        label: "Drift Test",
        description: "Testing drift detection",
        maxValidityHours: 8,
        requiredSlots: ["AREA_OWNER", "SAFETY_OFFICER"],
        schema: z.object({
          expectedField: z.string(),
        }),
        defaultPrecautions: [],
        fieldSections: [
          {
            title: "Section 1",
            fields: [
              { name: "expectedField", label: "Expected", type: "text" },
              { name: "unmappedGhostField", label: "Ghost Field", type: "text" },
            ],
          },
        ],
      };

      const check = validateRegistryFormDrift(dummyDriftDef);
      expect(check.valid).toBe(false);
      expect(check.errors).toContain(
        "Form field 'unmappedGhostField' does not exist in Zod schema for permit type 'TEST_DRIFT_EXTRA_FIELD'"
      );
    });

    it("detects when a required schema field is missing from form field configuration", () => {
      const dummyMissingDef: PermitTypeDefinition = {
        key: "TEST_DRIFT_MISSING_CONFIG",
        label: "Drift Test",
        description: "Testing missing form config",
        maxValidityHours: 8,
        requiredSlots: ["AREA_OWNER", "SAFETY_OFFICER"],
        schema: z.object({
          configuredField: z.string(),
          unconfiguredRequiredField: z.number(), // Required in schema but omitted from UI fields!
        }),
        defaultPrecautions: [],
        fieldSections: [
          {
            title: "Section 1",
            fields: [{ name: "configuredField", label: "Configured", type: "text" }],
          },
        ],
      };

      const check = validateRegistryFormDrift(dummyMissingDef);
      expect(check.valid).toBe(false);
      expect(check.errors).toContain(
        "Required schema field 'unconfiguredRequiredField' is missing from form fieldSections for permit type 'TEST_DRIFT_MISSING_CONFIG'"
      );
    });
  });

  describe("Extensibility Proof: Dynamic Runtime TEST_DUMMY Permit Type", () => {
    const dummyRadiationSchema = z.object({
      isotopeName: z.string().trim().min(2, "Isotope name is required (e.g. Cobalt-60, Iridium-192)"),
      sourceActivityCurie: z.number().min(0.01, "Source activity must be greater than zero"),
      barricadeRadiusM: z.number().min(5, "Radiation barricade perimeter must be at least 5m"),
      gammaDosimeterSerial: z.string().trim().min(2, "Calibrated survey meter serial # is required"),
    });

    type DummyRadiationTypeData = z.infer<typeof dummyRadiationSchema>;

    const testRadiationDefinition: PermitTypeDefinition<DummyRadiationTypeData> = {
      key: "TEST_DUMMY_RADIOGRAPHY",
      label: "Industrial Radiography Permit",
      description: "Non-destructive testing using gamma/X-ray radioactive isotopes.",
      schema: dummyRadiationSchema,
      requiredSlots: ["AREA_OWNER", "SAFETY_OFFICER"],
      maxValidityHours: 8, // 8-hour maximum shift
      hasEntryExitLog: false,
      defaultPrecautions: [
        { id: "lead_collimator", label: "Lead collimator fitted to source projection tube", mandatory: true },
        { id: "survey_meter_calibrated", label: "Calibrated gamma survey meter verified functional", mandatory: true },
      ],
      fieldSections: [
        {
          title: "Isotope & Source Specifications",
          fields: [
            { name: "isotopeName", label: "Radioisotope Name", type: "text", required: true },
            { name: "sourceActivityCurie", label: "Activity (Curie)", type: "number", required: true },
            { name: "barricadeRadiusM", label: "Cordone Radius (m)", type: "number", required: true },
            { name: "gammaDosimeterSerial", label: "Calibrated Meter Serial", type: "text", required: true },
          ],
        },
      ],
      validateBusinessRules: (data) => {
        if (data.barricadeRadiusM < 10 && data.sourceActivityCurie > 50) {
          return "Safety violation: Sources > 50 Ci require at least 10m exclusion radius.";
        }
        return null;
      },
    };

    it("registers dynamic TEST_DUMMY at runtime and runs complete lifecycle with zero schema modifications", () => {
      // 1. Register dynamically at runtime
      registerPermitType(testRadiationDefinition);
      expect(getPermitType("TEST_DUMMY_RADIOGRAPHY")).toBeDefined();

      // 2. Validate payload validation
      const invalidData = {
        isotopeName: "Ir-192",
        sourceActivityCurie: 65,
        barricadeRadiusM: 8, // Triggers business rule: > 50 Ci requires >= 10m
        gammaDosimeterSerial: "GM-991",
      };
      const failCheck = validatePermitTypeData("TEST_DUMMY_RADIOGRAPHY", invalidData);
      expect(failCheck.success).toBe(false);
      if (!failCheck.success) {
        expect(failCheck.errors[0]).toMatch(/Sources > 50 Ci require at least 10m exclusion radius/);
      }

      const validData = {
        isotopeName: "Ir-192",
        sourceActivityCurie: 65,
        barricadeRadiusM: 15,
        gammaDosimeterSerial: "GM-991",
      };
      expect(validatePermitTypeData("TEST_DUMMY_RADIOGRAPHY", validData).success).toBe(true);

      // 3. Run complete permit lifecycle using generic Permit entity
      const now = new Date();
      const start = new Date(now.getTime() - 1000 * 60 * 10);
      const end = new Date(now.getTime() + 1000 * 60 * 60 * 4); // 4h duration <= 8h max

      const permit: PermitData = {
        id: "permit_rad_01",
        permitSequence: 901,
        permitNumber: "PTW-2026-0901",
        status: "DRAFT",
        type: "TEST_DUMMY_RADIOGRAPHY",
        requesterId: "user_radiographer",
        contractorTeam: "NDT Specialists Ltd",
        workDescription: "Pipeline weld seam gamma radiography",
        equipmentId: "eq_pipe_weld",
        plannedStartTime: start,
        plannedEndTime: end,
        expiresAt: end,
        hazards: ["IONIZING_RADIATION"],
        ppeRequired: ["TLD_BADGE", "DOSIMETER", "LEAD_APRON"],
        precautionsChecklist: {
          lead_collimator: true,
          survey_meter_calibrated: true,
        },
        typeData: validData,
        approvalRound: 1,
        version: 1,
        createdAt: now,
        updatedAt: now,
        area: {
          id: "area_pipe_yard",
          plantId: "plant_1",
          code: "PIPE_YARD",
          name: "Pipe Fabrication Yard",
          ownerId: "user_pipe_owner",
        },
        approvals: [],
      };

      const requesterUser = { id: "user_radiographer", name: "Worker", email: "rad@test.com", role: "REQUESTER" as const };
      const areaOwnerUser = { id: "user_pipe_owner", name: "Area Lead", email: "ao@test.com", role: "AREA_OWNER" as const };
      const safetyUser = { id: "user_rso", name: "Radiation Safety Officer", email: "rso@test.com", role: "SAFETY_OFFICER" as const };

      // Step 1: Submit
      const submitCheck = checkAction(permit, requesterUser, "SUBMIT", now);
      expect(submitCheck.allowed).toBe(true);
      permit.status = getNextStatus(permit.status, "SUBMIT");
      expect(permit.status).toBe("PENDING_APPROVAL");

      // Step 2: Area Owner Approval
      const aoCheck = checkAction(permit, areaOwnerUser, "APPROVE", now);
      expect(aoCheck.allowed).toBe(true);
      permit.approvals?.push({
        id: "app_ao_rad",
        permitId: permit.id,
        round: 1,
        slot: "AREA_OWNER",
        approverId: areaOwnerUser.id,
        decision: "APPROVED",
        createdAt: now,
      });

      const roundStatus1 = evaluateApprovalSlots(permit);
      expect(roundStatus1.allSlotsFilled).toBe(false);
      permit.status = getNextStatus(permit.status, "APPROVE", { allApprovalsComplete: false });
      expect(permit.status).toBe("PENDING_APPROVAL");

      // Step 3: Safety Officer Approval
      const soCheck = checkAction(permit, safetyUser, "APPROVE", now);
      expect(soCheck.allowed).toBe(true);
      permit.approvals?.push({
        id: "app_so_rad",
        permitId: permit.id,
        round: 1,
        slot: "SAFETY_OFFICER",
        approverId: safetyUser.id,
        decision: "APPROVED",
        createdAt: now,
      });

      const roundStatus2 = evaluateApprovalSlots(permit);
      expect(roundStatus2.allSlotsFilled).toBe(true);
      permit.status = getNextStatus(permit.status, "APPROVE", { allApprovalsComplete: true });
      expect(permit.status).toBe("APPROVED");

      // Step 4: Activate
      const activateCheck = checkAction(permit, requesterUser, "ACTIVATE", now);
      expect(activateCheck.allowed).toBe(true);
      permit.status = getNextStatus(permit.status, "ACTIVATE");
      expect(permit.status).toBe("ACTIVE");

      // Step 5: Close
      const closeCheck = checkAction(permit, requesterUser, "CLOSE", now);
      expect(closeCheck.allowed).toBe(true);
      permit.status = getNextStatus(permit.status, "CLOSE");
      permit.closedById = requesterUser.id;
      expect(permit.status).toBe("CLOSED");

      // Step 6: Verify Closure (Safety Officer who is not requester and not closedById)
      const verifyCheck = checkAction(permit, safetyUser, "VERIFY_CLOSURE", now);
      expect(verifyCheck.allowed).toBe(true);
      permit.status = getNextStatus(permit.status, "VERIFY_CLOSURE");
      expect(permit.status).toBe("CLOSED_VERIFIED");

      // Cleanup
      unregisterPermitType("TEST_DUMMY_RADIOGRAPHY");
    });
  });
});
