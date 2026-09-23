/**
 * Shared Zod input schemas for the Permit API.
 *
 * These schemas validate the raw HTTP request bodies ONLY.
 * They do NOT duplicate permit-type registry validation — that is
 * handled separately by validatePermitTypeData() from the registry.
 */
import { z } from "zod";

// Reject explicitly banned client-supplied fields with clear error messages
const BannedClientFields = z
  .object({
    requesterId: z.undefined({
      message: "requesterId cannot be set by the client — it is derived from the authenticated session.",
    }),
    status: z.undefined({
      message: "status cannot be set by the client — it is controlled by the workflow engine.",
    }),
    permitNumber: z.undefined({
      message: "permitNumber is assigned by the server and cannot be client-supplied.",
    }),
    expiresAt: z.undefined({
      message: "expiresAt is server-controlled and cannot be set by the client.",
    }),
    plantId: z.undefined({
      message: "plantId is derived from equipment → area → plant. Do not supply it directly.",
    }),
    areaId: z.undefined({
      message: "areaId is derived from equipment → area. Do not supply it directly.",
    }),
  })
  .strict();

export const SUPPORTED_PERMIT_TYPES = [
  "HOT_WORK",
  "CONFINED_SPACE_ENTRY",
  "WORKING_AT_HEIGHT",
  "ELECTRICAL_ISOLATION_LOTO",
] as const;

export type SupportedPermitType = (typeof SUPPORTED_PERMIT_TYPES)[number];

export const CreatePermitSchema = z
  .object({
    // Banned fields must be absent
    requesterId: z.undefined().optional(),
    status: z.undefined().optional(),
    permitNumber: z.undefined().optional(),
    expiresAt: z.undefined().optional(),
    plantId: z.undefined().optional(),
    areaId: z.undefined().optional(),

    // Required core fields
    type: z.enum(SUPPORTED_PERMIT_TYPES, {
      message: `Permit type must be one of: ${SUPPORTED_PERMIT_TYPES.join(", ")}`,
    }),
    equipmentId: z.string().min(1, "equipmentId is required"),
    contractorTeam: z.string().trim().min(1, "Contractor/maintenance team is required"),
    workDescription: z.string().trim().min(10, "Work description must be at least 10 characters"),
    plannedStartTime: z.coerce.date({ message: "plannedStartTime must be a valid ISO datetime" }),
    plannedEndTime: z.coerce.date({ message: "plannedEndTime must be a valid ISO datetime" }),

    // Safety fields
    hazards: z
      .array(z.string().trim().min(1))
      .min(1, "At least one hazard must be identified"),
    ppeRequired: z
      .array(z.string().trim().min(1))
      .min(1, "At least one PPE item is required"),
    precautionsChecklist: z
      .record(z.string(), z.boolean())
      .default({}),

    // Type-specific data (validated by registry separately)
    typeData: z.record(z.string(), z.unknown()).default({}),
  })
  .superRefine((data, ctx) => {
    // Validate dates are not both missing or invalid
    if (data.plannedStartTime && data.plannedEndTime) {
      if (data.plannedStartTime >= data.plannedEndTime) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["plannedEndTime"],
          message: "plannedEndTime must be strictly after plannedStartTime",
        });
      }
    }
  });

export type CreatePermitInput = z.infer<typeof CreatePermitSchema>;

export const PatchPermitSchema = z
  .object({
    // Banned fields
    requesterId: z.undefined().optional(),
    status: z.undefined().optional(),
    permitNumber: z.undefined().optional(),
    expiresAt: z.undefined().optional(),
    plantId: z.undefined().optional(),
    areaId: z.undefined().optional(),

    // Updatable fields (all optional on patch)
    equipmentId: z.string().min(1).optional(),
    contractorTeam: z.string().trim().min(1).optional(),
    workDescription: z.string().trim().min(10).optional(),
    plannedStartTime: z.coerce.date().optional(),
    plannedEndTime: z.coerce.date().optional(),
    hazards: z.array(z.string().trim().min(1)).min(1).optional(),
    ppeRequired: z.array(z.string().trim().min(1)).min(1).optional(),
    precautionsChecklist: z.record(z.string(), z.boolean()).optional(),
    typeData: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (d) =>
      d.equipmentId !== undefined ||
      d.contractorTeam !== undefined ||
      d.workDescription !== undefined ||
      d.plannedStartTime !== undefined ||
      d.plannedEndTime !== undefined ||
      d.hazards !== undefined ||
      d.ppeRequired !== undefined ||
      d.precautionsChecklist !== undefined ||
      d.typeData !== undefined,
    { message: "At least one field must be provided for update." }
  );

export type PatchPermitInput = z.infer<typeof PatchPermitSchema>;

// List filters
export const ListPermitsQuerySchema = z.object({
  status: z.string().optional(),
  type: z.string().optional(),
  equipmentId: z.string().optional(),
  areaId: z.string().optional(),
  plantId: z.string().optional(),
  requesterId: z.string().optional(),
  mine: z
    .preprocess(
      (v) => (v === "true" ? true : v === "false" ? false : v),
      z.boolean().optional()
    )
    .optional(),
  myApprovals: z
    .preprocess(
      (v) => (v === "true" ? true : v === "false" ? false : v),
      z.boolean().optional()
    )
    .optional(),
  date: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListPermitsQuery = z.infer<typeof ListPermitsQuerySchema>;

// Dashboard query schema
export const DashboardQuerySchema = z.object({
  status: z.string().optional(),
  type: z.string().optional(),
  equipmentId: z.string().optional(),
  areaId: z.string().optional(),
  plantId: z.string().optional(),
  requesterId: z.string().optional(),
  mine: z
    .preprocess(
      (v) => (v === "true" ? true : v === "false" ? false : v),
      z.boolean().optional()
    )
    .optional(),
  myApprovals: z
    .preprocess(
      (v) => (v === "true" ? true : v === "false" ? false : v),
      z.boolean().optional()
    )
    .optional(),
  date: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type DashboardQuery = z.infer<typeof DashboardQuerySchema>;

// Validate BannedClientFields separately and return errors for banned keys
void BannedClientFields; // keep the type for reference

// ─── Phase 4 Workflow Action Schemas ────────────────────────────────────────

export const ApprovePermitSchema = z.object({
  slot: z.enum(["AREA_OWNER", "SAFETY_OFFICER"]).optional(),
  comment: z.string().trim().optional(),
  signatureSvg: z.string().optional(),
});
export type ApprovePermitInput = z.infer<typeof ApprovePermitSchema>;

export const RejectPermitSchema = z.object({
  reason: z
    .string({ message: "Rejection reason is required." })
    .trim()
    .min(1, "Rejection reason is required."),
  slot: z.enum(["AREA_OWNER", "SAFETY_OFFICER"]).optional(),
});
export type RejectPermitInput = z.infer<typeof RejectPermitSchema>;

export const SuspendPermitSchema = z.object({
  reason: z
    .string({ message: "Suspension reason is required." })
    .trim()
    .min(1, "Suspension reason is required."),
});
export type SuspendPermitInput = z.infer<typeof SuspendPermitSchema>;

export const CancelPermitSchema = z.object({
  reason: z
    .string({ message: "Cancellation reason is required." })
    .trim()
    .min(1, "Cancellation reason is required."),
});
export type CancelPermitInput = z.infer<typeof CancelPermitSchema>;

export const ClosePermitSchema = z.object({
  workCompletionNotes: z
    .string({ message: "Work completion notes are required." })
    .trim()
    .min(1, "Work completion notes are required."),
});
export type ClosePermitInput = z.infer<typeof ClosePermitSchema>;

export const VerifyClosurePermitSchema = z.object({
  closureVerifiedNotes: z.string().trim().optional(),
});
export type VerifyClosurePermitInput = z.infer<typeof VerifyClosurePermitSchema>;

// ─── Phase 5 Work Logging & Entry/Exit Schemas ──────────────────────────────

export const LogWorkSchema = z.object({
  description: z
    .string({ message: "Work log description is required." })
    .trim()
    .min(1, "Work log description is required."),
  performedAt: z.coerce.date().optional(),
});
export type LogWorkInput = z.infer<typeof LogWorkSchema>;

export const LogEntryExitSchema = z.object({
  direction: z.enum(["ENTRY", "EXIT"], { message: "Direction must be ENTRY or EXIT" }),
  personName: z
    .string({ message: "Person name is required." })
    .trim()
    .min(1, "Person name is required."),
  at: z.coerce.date().optional(),
});
export type LogEntryExitInput = z.infer<typeof LogEntryExitSchema>;

