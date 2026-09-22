import { z } from "zod";
import { PermitTypeDefinition } from "./types";

export const hotWorkSchema = z.object({
  hotWorkType: z.enum(["WELDING", "GRINDING", "CUTTING", "SOLDERING"], {
    message: "Hot work type must be WELDING, GRINDING, CUTTING, or SOLDERING",
  }),
  fireWatchName: z.string().trim().min(2, "Fire watch attendant name is required"),
  fireExtinguisherType: z.string().trim().min(2, "Fire extinguisher type is required (e.g. CO2, Dry Powder, Foam)"),
  combustiblesClearedRadiusMetres: z
    .number({ message: "Combustible clearance radius in metres is required" })
    .min(5, "Combustible clearance radius must be at least 5 metres")
    .max(100, "Combustible clearance radius exceeds maximum 100m"),
  gasTestLelPercent: z
    .number({ message: "LEL percentage is required" })
    .min(0, "LEL % cannot be negative")
    .max(100, "LEL % cannot exceed 100%"),
  gasTestO2Percent: z
    .number({ message: "O2 percentage is required" })
    .min(0, "O2 % cannot be negative")
    .max(100, "O2 % cannot exceed 100%"),
  gasTestTime: z
    .string()
    .min(1, "Gas test timestamp is required")
    .refine((val) => !isNaN(new Date(val).getTime()), {
      message: "Gas test timestamp must be a valid datetime string",
    })
    .refine((val) => new Date(val).getTime() <= Date.now() + 60000, {
      message: "Gas test timestamp cannot be in the future",
    }),
  gasTesterName: z.string().trim().min(2, "Gas tester name is required"),
});

export type HotWorkTypeData = z.infer<typeof hotWorkSchema>;

export const hotWorkDefinition: PermitTypeDefinition<HotWorkTypeData> = {
  key: "HOT_WORK",
  label: "Hot Work Permit",
  description: "Required for open flame, welding, grinding, cutting, or soldering where spark or heat hazards exist.",
  schema: hotWorkSchema,
  requiredSlots: ["AREA_OWNER", "SAFETY_OFFICER"],
  maxValidityHours: 12, // Standard shift / 12-hour maximum validity
  hasEntryExitLog: false,
  defaultPrecautions: [
    { id: "fire_watch", label: "Dedicated Fire Watch trained and stationed with extinguisher", mandatory: true },
    { id: "combustibles_cleared", label: "Flammables and combustibles removed or shielded within clearance radius", mandatory: true },
    { id: "floor_covered", label: "Drains, pits, and combustible flooring wetted down or covered with fire blankets", mandatory: true },
    { id: "gas_tested", label: "Atmospheric test completed: LEL 0% and Oxygen within safe 19.5%-23.5% range", mandatory: true },
    { id: "ventilation_adequate", label: "Natural or mechanical exhaust ventilation in place", mandatory: false },
  ],
  fieldSections: [
    {
      title: "Hot Work Details",
      fields: [
        {
          name: "hotWorkType",
          label: "Type of Hot Work",
          type: "select",
          required: true,
          options: [
            { value: "WELDING", label: "Welding (Arc, TIG, MIG, Gas)" },
            { value: "GRINDING", label: "Grinding" },
            { value: "CUTTING", label: "Oxy-fuel / Plasma Cutting" },
            { value: "SOLDERING", label: "Soldering / Brazing" },
          ],
        },
        {
          name: "fireWatchName",
          label: "Assigned Fire Watch Person",
          type: "text",
          required: true,
          placeholder: "Full name of trained fire watch",
        },
        {
          name: "fireExtinguisherType",
          label: "Fire Extinguisher Type Present",
          type: "text",
          required: true,
          placeholder: "e.g. DCP 9kg, CO2 4.5kg",
        },
        {
          name: "combustiblesClearedRadiusMetres",
          label: "Combustibles Cleared Radius (metres)",
          type: "number",
          required: true,
          min: 5,
          max: 100,
          defaultValue: 10,
          helpText: "Standard industrial clearance is at least 10 metres (or 35 feet).",
        },
      ],
    },
    {
      title: "Atmospheric Gas Testing",
      description: "Must be tested before starting work and verified by a competent tester.",
      fields: [
        {
          name: "gasTestLelPercent",
          label: "Flammable Gas Reading (% LEL)",
          type: "number",
          required: true,
          min: 0,
          max: 100,
          step: 0.1,
          helpText: "Work is prohibited if LEL exceeds 0% in hazardous zones.",
        },
        {
          name: "gasTestO2Percent",
          label: "Oxygen Concentration (% O2)",
          type: "number",
          required: true,
          min: 0,
          max: 100,
          step: 0.1,
          helpText: "Safe breathable range is 19.5% to 23.5%.",
        },
        {
          name: "gasTestTime",
          label: "Gas Test Time",
          type: "datetime",
          required: true,
        },
        {
          name: "gasTesterName",
          label: "Competent Gas Tester",
          type: "text",
          required: true,
          placeholder: "Tester name and certificate ID",
        },
      ],
    },
  ],
  validateBusinessRules: (data) => {
    if (data.gasTestLelPercent > 0) {
      return "Safety violation: Flammable gas (LEL) reading must be 0% for hot work to proceed.";
    }
    if (data.gasTestO2Percent < 19.5 || data.gasTestO2Percent > 23.5) {
      return "Safety violation: Oxygen concentration must be between 19.5% and 23.5%.";
    }
    return null;
  },
};

