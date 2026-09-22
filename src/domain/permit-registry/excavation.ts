import { z } from "zod";
import { PermitTypeDefinition } from "./types";

export const excavationSchema = z.object({
  trenchDepthMetres: z
    .number({ message: "Excavation depth in metres is required" })
    .min(0.3, "Excavation permits apply to depths >= 0.3m")
    .max(20, "Depth exceeds maximum excavation depth"),
  soilType: z.enum(["TYPE_A_COHESIVE", "TYPE_B_MEDIUM", "TYPE_C_GRANULAR", "SOLID_ROCK"], {
    message: "OSHA/IS Soil Classification must be selected",
  }),
  protectiveSystem: z.enum(["SHORING", "SHIELDING_TRENCH_BOX", "SLOPING_BENCHING", "NONE_SOLID_ROCK"], {
    message: "Cave-in protective system must be selected",
  }),
  undergroundUtilitiesScanned: z.boolean().refine((val) => val === true, {
    message: "Underground utilities detection (Cable Locator / GPR scan) is mandatory",
  }),
  utilityScanCertificateNumber: z.string().trim().min(2, "Utility clearance certificate reference is required"),
  competentPersonName: z.string().trim().min(2, "Competent excavation inspector name is required"),
});

export type ExcavationTypeData = z.infer<typeof excavationSchema>;

export const excavationDefinition: PermitTypeDefinition<ExcavationTypeData> = {
  key: "EXCAVATION",
  label: "Excavation & Trenching Permit",
  description: "Required for any mechanical or manual trenching, digging, or ground penetration deeper than 0.3 metres (1 foot).",
  schema: excavationSchema,
  requiredSlots: ["AREA_OWNER", "SAFETY_OFFICER"],
  maxValidityHours: 24, // 24-hour maximum validity window
  hasEntryExitLog: false,
  defaultPrecautions: [
    { id: "utility_clearance", label: "Underground cable, pipe, and fiber optic scans completed & clear", mandatory: true },
    { id: "spoil_pile_clearance", label: "Excavated spoil and equipment kept at least 1 metre away from trench edge", mandatory: true },
    { id: "access_ladders", label: "Egress ladders placed every 7.5m (25 ft) extending 1m above ground", mandatory: true },
    { id: "trench_barricade", label: "Rigid perimeter barricade and blinking hazard lights erected around trench", mandatory: true },
  ],
  fieldSections: [
    {
      title: "Excavation Scope & Soil Mechanics",
      fields: [
        {
          name: "trenchDepthMetres",
          label: "Maximum Depth (metres)",
          type: "number",
          required: true,
          min: 0.3,
          max: 20,
          step: 0.1,
        },
        {
          name: "soilType",
          label: "Soil Classification",
          type: "select",
          required: true,
          options: [
            { value: "TYPE_A_COHESIVE", label: "Type A (Hard Clay, Caliche)" },
            { value: "TYPE_B_MEDIUM", label: "Type B (Silt, Sandy Loam)" },
            { value: "TYPE_C_GRANULAR", label: "Type C (Loose Sand, Submerged Soil)" },
            { value: "SOLID_ROCK", label: "Solid Stable Rock" },
          ],
        },
        {
          name: "protectiveSystem",
          label: "Cave-In Protective System",
          type: "select",
          required: true,
          options: [
            { value: "SHORING", label: "Hydraulic / Timber Shoring" },
            { value: "SHIELDING_TRENCH_BOX", label: "Trench Shield / Trench Box" },
            { value: "SLOPING_BENCHING", label: "Sloping / Benching to Angle of Repose" },
            { value: "NONE_SOLID_ROCK", label: "None (Solid Rock only)" },
          ],
        },
      ],
    },
    {
      title: "Underground Utility & Ground Stability Checks",
      fields: [
        {
          name: "undergroundUtilitiesScanned",
          label: "Underground utility scan verified clear",
          type: "boolean",
          required: true,
        },
        {
          name: "utilityScanCertificateNumber",
          label: "Utility Scan Clearance Permit #",
          type: "text",
          required: true,
          placeholder: "e.g. UTIL-SCAN-2026-119",
        },
        {
          name: "competentPersonName",
          label: "Competent Soil & Trench Inspector",
          type: "text",
          required: true,
        },
      ],
    },
  ],
};
