import { z } from "zod";
import { PermitAction } from "../types";

export const rejectPayloadSchema = z.object({
  reason: z
    .string({ message: "A mandatory non-empty rejection reason is required." })
    .trim()
    .min(1, "A mandatory non-empty rejection reason is required."),
  slot: z.enum(["AREA_OWNER", "SAFETY_OFFICER"]).optional(),
});

export const suspendPayloadSchema = z.object({
  reason: z
    .string({ message: "A mandatory non-empty suspension reason is required." })
    .trim()
    .min(1, "A mandatory non-empty suspension reason is required."),
});

export const cancelPayloadSchema = z.object({
  reason: z
    .string({ message: "A mandatory non-empty cancellation reason is required." })
    .trim()
    .min(1, "A mandatory non-empty cancellation reason is required."),
});

export const closePayloadSchema = z.object({
  workCompletionNotes: z
    .string({ message: "Work completion notes and housekeeping confirmation are required to close the permit." })
    .trim()
    .min(1, "Work completion notes and housekeeping confirmation are required to close the permit."),
});

export const verifyClosurePayloadSchema = z.object({
  closureVerifiedNotes: z.string().trim().optional(),
});

export const approvePayloadSchema = z.object({
  slot: z.enum(["AREA_OWNER", "SAFETY_OFFICER"]).optional(),
  comment: z.string().trim().optional(),
  signatureSvg: z.string().optional(),
});

export const requestExtensionPayloadSchema = z.object({
  requestedHours: z
    .number({ message: "Requested hours must be a number" })
    .int("Requested hours must be an integer")
    .min(1, "Requested extension must be at least 1 hour")
    .max(4, "Single extension cannot exceed 4 hours"),
  reason: z.string().trim().min(1, "A mandatory non-empty reason for extension is required."),
});

export const extensionDecisionPayloadSchema = z.object({
  extensionId: z.string().min(1, "Extension ID is required"),
  comment: z.string().trim().optional(),
});

export const logWorkPayloadSchema = z.object({
  description: z.string().trim().min(1, "Work log description is required."),
  performedAt: z.coerce.date().optional(),
});

export const logEntryExitPayloadSchema = z.object({
  direction: z.enum(["ENTRY", "EXIT"], { message: "Direction must be ENTRY or EXIT" }),
  personName: z.string().trim().min(1, "Person name is required."),
  at: z.coerce.date().optional(),
});

export type ActionPayloadMap = {
  REJECT: z.infer<typeof rejectPayloadSchema>;
  SUSPEND: z.infer<typeof suspendPayloadSchema>;
  CANCEL: z.infer<typeof cancelPayloadSchema>;
  CLOSE: z.infer<typeof closePayloadSchema>;
  VERIFY_CLOSURE: z.infer<typeof verifyClosurePayloadSchema>;
  APPROVE: z.infer<typeof approvePayloadSchema>;
  REQUEST_EXTENSION: z.infer<typeof requestExtensionPayloadSchema>;
  APPROVE_EXTENSION: z.infer<typeof extensionDecisionPayloadSchema>;
  REJECT_EXTENSION: z.infer<typeof extensionDecisionPayloadSchema>;
  LOG_WORK: z.infer<typeof logWorkPayloadSchema>;
  LOG_ENTRY_EXIT: z.infer<typeof logEntryExitPayloadSchema>;
};

/**
 * Validates the input payload for an action using strict Zod schemas.
 * Independent of the authorization engine so getAvailableActions does not require dummy payloads.
 */
export function validateActionPayload(
  action: PermitAction,
  payload: unknown
): { success: true; data: unknown } | { success: false; errors: string[] } {
  let schema: z.ZodTypeAny;

  switch (action) {
    case "REJECT":
      schema = rejectPayloadSchema;
      break;
    case "SUSPEND":
      schema = suspendPayloadSchema;
      break;
    case "CANCEL":
      schema = cancelPayloadSchema;
      break;
    case "CLOSE":
      schema = closePayloadSchema;
      break;
    case "VERIFY_CLOSURE":
      schema = verifyClosurePayloadSchema;
      break;
    case "APPROVE":
      schema = approvePayloadSchema;
      break;
    case "REQUEST_EXTENSION":
      schema = requestExtensionPayloadSchema;
      break;
    case "APPROVE_EXTENSION":
    case "REJECT_EXTENSION":
      schema = extensionDecisionPayloadSchema;
      break;
    case "LOG_WORK":
      schema = logWorkPayloadSchema;
      break;
    case "LOG_ENTRY_EXIT":
      schema = logEntryExitPayloadSchema;
      break;
    default:
      // Other actions (SUBMIT, ACTIVATE, RESUME, EDIT, EXPIRE) do not have mandatory reason payloads
      return { success: true, data: payload };
  }

  const result = schema.safeParse(payload);
  if (!result.success) {
    return {
      success: false,
      errors: result.error.issues.map((i) => i.message),
    };
  }

  return { success: true, data: result.data };
}
