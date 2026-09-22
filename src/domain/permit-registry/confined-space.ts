import { z } from "zod";
import { PermitTypeDefinition } from "./types";

export const confinedSpaceSchema = z.object({
  spaceId: z.string().trim().min(2, "Confined Space ID / Vessel tag is required"),
  entryPoint: z.string().trim().min(2, "Specific entry point / manway location is required"),
  standbyAttendantName: z.string().trim().min(2, "Standby attendant name is required"),
  rescuePlanDescription: z.string().trim().min(10, "Detailed rescue and retrieval plan is required"),
  ventilationMethod: z.enum(["FORCED_MECHANICAL", "NATURAL_DRAFT", "CONTINUOUS_AIR_MOVER"], {
    message: "Ventilation method must be selected",
  }),
  gasTestO2Percent: z
    .number({ message: "Oxygen percentage is required" })
    .min(0)
    .max(100),
  gasTestLelPercent: z
    .number({ message: "LEL percentage is required" })
    .min(0)
    .max(100),
  gasTestH2sPpm: z
    .number({ message: "H2S ppm is required" })
    .min(0, "H2S ppm cannot be negative"),
  gasTestCoPpm: z
    .number({ message: "CO ppm is required" })
    .min(0, "CO ppm cannot be negative"),
  gasTestTime: z.string().min(1, "Atmospheric test time is required"),
  gasTesterName: z.string().trim().min(2, "Atmospheric tester name is required"),
  communicationMethod: z.string().trim().min(2, "Communication method between attendant and entrants is required"),
});

export type ConfinedSpaceTypeData = z.infer<typeof confinedSpaceSchema>;

export const confinedSpaceDefinition: PermitTypeDefinition<ConfinedSpaceTypeData> = {
  key: "CONFINED_SPACE_ENTRY",
  label: "Confined Space Entry Permit",
  description: "Required for entry into enclosed or partially enclosed spaces not designed for continuous human occupancy (tanks, vessels, silos, vaults, pits).",
  schema: confinedSpaceSchema,
  requiredSlots: ["AREA_OWNER", "SAFETY_OFFICER"],
  defaultPrecautions: [
    { id: "isolation_verified", label: "Positive mechanical and electrical isolation verified (piping blanked/disconnected, LOTO applied)", mandatory: true },
    { id: "atmospheric_test", label: "Multi-gas atmospheric test completed at all levels (top, middle, bottom)", mandatory: true },
    { id: "continuous_ventilation", label: "Continuous forced air mechanical ventilation operating", mandatory: true },
    { id: "standby_attendant", label: "Dedicated standby attendant posted at entry with entry/exit log and rescue winch", mandatory: true },
    { id: "harness_lifeline", label: "Full body harness and retrieval lifeline worn by entrants where feasible", mandatory: false },
    { id: "continuous_monitor", label: "Entrants equipped with calibrated personal 4-gas monitor", mandatory: true },
  ],
  fieldSections: [
    {
      title: "Confined Space Identification & Safety Setup",
      fields: [
        {
          name: "spaceId",
          label: "Confined Space ID / Tag",
          type: "text",
          required: true,
          placeholder: "e.g. TK-402, Silo-03, Culvert Pit A",
        },
        {
          name: "entryPoint",
          label: "Entry Point / Manway",
          type: "text",
          required: true,
          placeholder: "e.g. North Side Top Manhole #2",
        },
        {
          name: "standbyAttendantName",
          label: "Standby Attendant Name",
          type: "text",
          required: true,
          placeholder: "Attendant stationed at entry point",
        },
        {
          name: "ventilationMethod",
          label: "Ventilation Method",
          type: "select",
          required: true,
          options: [
            { value: "FORCED_MECHANICAL", label: "Forced Mechanical Air Blower (Continuous)" },
            { value: "CONTINUOUS_AIR_MOVER", label: "Pneumatic Air Mover / Eductor" },
            { value: "NATURAL_DRAFT", label: "Natural Draft (only if verified inert & clean)" },
          ],
        },
        {
          name: "communicationMethod",
          label: "Entrant-Attendant Communication",
          type: "text",
          required: true,
          placeholder: "e.g. Intrinsically Safe UHF Radio, Visual / Voice",
        },
        {
          name: "rescuePlanDescription",
          label: "Emergency Rescue Plan",
          type: "textarea",
          required: true,
          placeholder: "Describe rescue tripod, hoist, rescue team on standby, and emergency contact procedure",
        },
      ],
    },
    {
      title: "Atmospheric Multi-Gas Test Readings",
      description: "Must be calibrated and measured prior to any human entry.",
      fields: [
        {
          name: "gasTestO2Percent",
          label: "Oxygen Concentration (% O2)",
          type: "number",
          required: true,
          step: 0.1,
          helpText: "Safe range: 19.5% to 23.5%.",
        },
        {
          name: "gasTestLelPercent",
          label: "Flammable Gas (% LEL)",
          type: "number",
          required: true,
          step: 0.1,
          helpText: "Must be under 5% (ideal 0%).",
        },
        {
          name: "gasTestH2sPpm",
          label: "Hydrogen Sulfide (H2S ppm)",
          type: "number",
          required: true,
          step: 0.1,
          helpText: "Must not exceed 5 ppm threshold limit.",
        },
        {
          name: "gasTestCoPpm",
          label: "Carbon Monoxide (CO ppm)",
          type: "number",
          required: true,
          step: 0.1,
          helpText: "Must not exceed 25 ppm threshold limit.",
        },
        {
          name: "gasTestTime",
          label: "Atmospheric Test Time",
          type: "datetime",
          required: true,
        },
        {
          name: "gasTesterName",
          label: "Certified Gas Tester",
          type: "text",
          required: true,
        },
      ],
    },
  ],
  validateBusinessRules: (data) => {
    if (data.gasTestO2Percent < 19.5 || data.gasTestO2Percent > 23.5) {
      return "Atmospheric hazard: Oxygen level must be between 19.5% and 23.5% for confined space entry.";
    }
    if (data.gasTestLelPercent > 5) {
      return "Atmospheric hazard: Combustible gas (LEL) exceeds maximum permissible entry limit of 5%.";
    }
    if (data.gasTestH2sPpm > 10) {
      return "Atmospheric hazard: Toxic gas (H2S) exceeds safe exposure limit of 10 ppm.";
    }
    if (data.gasTestCoPpm > 25) {
      return "Atmospheric hazard: Carbon monoxide (CO) exceeds safe exposure limit of 25 ppm.";
    }
    return null;
  },
};
