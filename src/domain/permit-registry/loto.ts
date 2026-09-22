import { z } from "zod";
import { PermitTypeDefinition } from "./types";

export const electricalLotoSchema = z.object({
  equipmentTag: z.string().trim().min(2, "Equipment tag / MCC panel number is required"),
  voltageLevel: z.string().trim().min(2, "Voltage level is required (e.g. 415V, 6.6kV, 11kV, 33kV)"),
  isolationPointsList: z.array(z.string()).min(1, "At least one electrical/mechanical isolation point is required"),
  lockNumbers: z.array(z.string()).min(1, "At least one padlock / master lock ID is required"),
  tagNumbers: z.array(z.string()).min(1, "At least one danger/caution tag number is required"),
  earthingApplied: z.boolean({ message: "Earthing applied confirmation is required" }),
  testedDeadBy: z.string().trim().min(2, "Certified person who performed voltage test (Zero Energy Verification) is required"),
  testInstrumentUsed: z.string().trim().min(2, "Calibrated multimeter / voltage detector details are required"),
  zeroEnergyVerified: z.boolean().refine((val) => val === true, {
    message: "Zero Energy Verification (Live-Dead-Live test) must be completed before work starts",
  }),
});

export type ElectricalLotoTypeData = z.infer<typeof electricalLotoSchema>;

export const electricalLotoDefinition: PermitTypeDefinition<ElectricalLotoTypeData> = {
  key: "ELECTRICAL_ISOLATION_LOTO",
  label: "Electrical Isolation & LOTO Permit",
  description: "Required for working on or near de-energized electrical systems, switchgear, motors, transformers, or machinery requiring lock-out tag-out.",
  schema: electricalLotoSchema,
  requiredSlots: ["AREA_OWNER", "SAFETY_OFFICER"],
  defaultPrecautions: [
    { id: "isolation_points_locked", label: "Breakers racked out / switches open and padlocks applied", mandatory: true },
    { id: "tags_posted", label: "Standard DANGER - DO NOT OPERATE tags affixed with owner contact", mandatory: true },
    { id: "zero_energy_test", label: "Live-Dead-Live instrument test executed to prove equipment is dead", mandatory: true },
    { id: "stored_energy_dissipated", label: "Capacitors discharged and residual hydraulic/spring energy released", mandatory: true },
    { id: "portable_earthing", label: "Portable safety earth leads connected on all phases where required", mandatory: false },
  ],
  fieldSections: [
    {
      title: "Electrical System & Isolation Specifications",
      fields: [
        {
          name: "equipmentTag",
          label: "Equipment / Switchgear Tag",
          type: "text",
          required: true,
          placeholder: "e.g. MCC-04-BFP1, TR-04 11kV/415V",
        },
        {
          name: "voltageLevel",
          label: "Operating Voltage Level",
          type: "text",
          required: true,
          placeholder: "e.g. 415V AC, 3.3kV, 6.6kV, 11kV",
        },
        {
          name: "isolationPointsList",
          label: "Isolation Points (Breakers, Disconnects, Valves)",
          type: "string-list",
          required: true,
          placeholder: "e.g. Feeder Breaker CB-102, Control Fuse F-05",
        },
        {
          name: "lockNumbers",
          label: "Safety Padlock Numbers",
          type: "string-list",
          required: true,
          placeholder: "e.g. RED-LK-881, RED-LK-882",
        },
        {
          name: "tagNumbers",
          label: "Danger Tag Numbers",
          type: "string-list",
          required: true,
          placeholder: "e.g. TAG-2026-091, TAG-2026-092",
        },
      ],
    },
    {
      title: "Zero Energy & Earthing Verification",
      fields: [
        {
          name: "testedDeadBy",
          label: "Tested Dead By (Authorized Electrical Person)",
          type: "text",
          required: true,
          placeholder: "Licensed Electrical Supervisor name",
        },
        {
          name: "testInstrumentUsed",
          label: "Test Instrument Make/Model & Calibration Date",
          type: "text",
          required: true,
          placeholder: "e.g. Fluke T6-1000 (Cal: Jan 2026)",
        },
        {
          name: "zeroEnergyVerified",
          label: "Zero Energy State Confirmed (Live-Dead-Live verified)",
          type: "boolean",
          required: true,
        },
        {
          name: "earthingApplied",
          label: "Portable / Fixed safety earthing applied to phases",
          type: "boolean",
          required: true,
        },
      ],
    },
  ],
};
