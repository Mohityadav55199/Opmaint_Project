import { z } from "zod";
import { PermitTypeDefinition } from "./types";

export const workingAtHeightSchema = z.object({
  heightMetres: z
    .number({ message: "Height in metres is required" })
    .min(1.8, "Working at height permits apply to work 1.8 metres or higher")
    .max(150, "Height exceeds maximum operational limit of 150m"),
  accessMethod: z.enum(["SCAFFOLD", "LADDER", "MEWP", "ROPE_ACCESS"], {
    message: "Access method must be SCAFFOLD, LADDER, MEWP, or ROPE_ACCESS",
  }),
  fallArrestEquipment: z.string().trim().min(2, "Fall arrest equipment description is required (e.g. Full Body Harness with Shock Absorbing Lanyard)"),
  anchorPointChecked: z.boolean({ message: "Anchor point check confirmation is required" }).refine((val) => val === true, {
    message: "Anchor point must be inspected and verified safe prior to work",
  }),
  barricadingBelow: z.boolean({ message: "Ground barricading status is required" }).refine((val) => val === true, {
    message: "Ground area below must be barricaded with warning signs",
  }),
  rescuePlanAtHeight: z.string().trim().min(5, "Suspension trauma rescue procedure is required"),
  weatherCheckConfirmed: z.boolean({ message: "Wind/weather suitability must be confirmed" }),
});

export type WorkingAtHeightTypeData = z.infer<typeof workingAtHeightSchema>;

export const workingAtHeightDefinition: PermitTypeDefinition<WorkingAtHeightTypeData> = {
  key: "WORKING_AT_HEIGHT",
  label: "Working at Height Permit",
  description: "Required for any maintenance, inspection, or construction work performed at an elevation of 1.8 metres (6 feet) or higher where fall hazards exist.",
  schema: workingAtHeightSchema,
  requiredSlots: ["AREA_OWNER", "SAFETY_OFFICER"],
  maxValidityHours: 12,
  hasEntryExitLog: false,
  defaultPrecautions: [
    { id: "harness_inspected", label: "Full body harnesses, lanyards, and snap hooks pre-use inspected and tagged", mandatory: true },
    { id: "certified_anchor", label: "Certified anchor point (rated to minimum 15 kN / 5,000 lbs) identified and verified", mandatory: true },
    { id: "barricade_warning", label: "Ground drop zone barricaded with danger signage below work area", mandatory: true },
    { id: "tools_tethered", label: "Hand tools and loose materials secured with tool lanyards/pouches", mandatory: true },
    { id: "scaffold_green_tag", label: "If scaffolding used: verified with current valid GREEN inspection tag", mandatory: false },
  ],
  fieldSections: [
    {
      title: "Elevation & Access Details",
      fields: [
        {
          name: "heightMetres",
          label: "Height Above Ground (metres)",
          type: "number",
          required: true,
          min: 1.8,
          max: 150,
          step: 0.5,
          helpText: "Applies to elevations >= 1.8 metres (6 ft).",
        },
        {
          name: "accessMethod",
          label: "Access Method / Platform",
          type: "select",
          required: true,
          options: [
            { value: "SCAFFOLD", label: "Fixed / Mobile Modular Scaffolding" },
            { value: "MEWP", label: "Mobile Elevating Work Platform (Boom / Scissor Lift)" },
            { value: "LADDER", label: "Secured Extension / Step Ladder (Short duration only)" },
            { value: "ROPE_ACCESS", label: "Industrial Rope Access" },
          ],
        },
        {
          name: "fallArrestEquipment",
          label: "Fall Protection Equipment",
          type: "text",
          required: true,
          placeholder: "e.g. Dual lanyard harness with energy absorber & vertical lifeline",
        },
      ],
    },
    {
      title: "Anchor & Site Barricading Checks",
      fields: [
        {
          name: "anchorPointChecked",
          label: "Anchor point inspected by competent rigger",
          type: "boolean",
          required: true,
        },
        {
          name: "barricadingBelow",
          label: "Drop zone barricaded below with red hazard tape & signs",
          type: "boolean",
          required: true,
        },
        {
          name: "weatherCheckConfirmed",
          label: "Wind speed and weather conditions verified acceptable (< 25 knots)",
          type: "boolean",
          required: true,
        },
        {
          name: "rescuePlanAtHeight",
          label: "Suspension Trauma Rescue Plan",
          type: "textarea",
          required: true,
          placeholder: "Prompt rescue procedure in event of a fall arrest (ladder, rescue pole, MEWP)",
        },
      ],
    },
  ],
};
