import { describe, it, expect } from "vitest";
import { validateActionPayload } from "../src/domain/state-machine/payloads";

describe("Action Payload Zod Validation", () => {
  describe("REJECT action payload", () => {
    it("fails when payload is empty object {}", () => {
      const result = validateActionPayload("REJECT", {});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors.join(" ")).toMatch(/mandatory non-empty rejection reason/);
      }
    });

    it("fails when reason is missing or undefined", () => {
      const result = validateActionPayload("REJECT", undefined);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.length).toBeGreaterThan(0);
      }
    });

    it("fails when reason is whitespace-only", () => {
      const result = validateActionPayload("REJECT", { reason: "   \t\n  " });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.join(" ")).toMatch(/mandatory non-empty rejection reason/);
      }
    });

    it("succeeds with a valid trimmed rejection reason", () => {
      const result = validateActionPayload("REJECT", {
        reason: "Gas test reading is out of acceptable limits for hot work.",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as { reason: string }).reason).toBe(
          "Gas test reading is out of acceptable limits for hot work."
        );
      }
    });
  });

  describe("SUSPEND action payload", () => {
    it("fails when reason is missing or {}", () => {
      const result = validateActionPayload("SUSPEND", {});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.join(" ")).toMatch(/mandatory non-empty suspension reason/);
      }
    });

    it("fails when reason is whitespace-only", () => {
      const result = validateActionPayload("SUSPEND", { reason: "   " });
      expect(result.success).toBe(false);
    });

    it("succeeds with a valid suspension reason", () => {
      const result = validateActionPayload("SUSPEND", {
        reason: "Lightning storm detected within 5km radius of tank farm.",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("CANCEL action payload", () => {
    it("fails when reason is missing or {}", () => {
      const result = validateActionPayload("CANCEL", {});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.join(" ")).toMatch(/mandatory non-empty cancellation reason/);
      }
    });

    it("fails when reason is whitespace-only", () => {
      const result = validateActionPayload("CANCEL", { reason: " \n " });
      expect(result.success).toBe(false);
    });

    it("succeeds with a valid cancellation reason", () => {
      const result = validateActionPayload("CANCEL", {
        reason: "Maintenance job postponed due to spare parts delay.",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("CLOSE action payload", () => {
    it("fails when workCompletionNotes is missing or {}", () => {
      const result = validateActionPayload("CLOSE", {});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors.join(" ")).toMatch(/Work completion notes and housekeeping confirmation are required/);
      }
    });

    it("fails when workCompletionNotes is whitespace-only", () => {
      const result = validateActionPayload("CLOSE", { workCompletionNotes: "   " });
      expect(result.success).toBe(false);
    });

    it("succeeds with valid work completion notes", () => {
      const result = validateActionPayload("CLOSE", {
        workCompletionNotes: "All welding completed, slag cleaned, fire watch completed 30-min monitoring.",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("REQUEST_EXTENSION action payload", () => {
    it("fails when requestedHours is missing or 0", () => {
      const result = validateActionPayload("REQUEST_EXTENSION", { reason: "Extra time needed" });
      expect(result.success).toBe(false);

      const resultZero = validateActionPayload("REQUEST_EXTENSION", { requestedHours: 0, reason: "Extra time" });
      expect(resultZero.success).toBe(false);
    });

    it("fails when requestedHours exceeds 4 hours", () => {
      const result = validateActionPayload("REQUEST_EXTENSION", { requestedHours: 5, reason: "Extra time" });
      expect(result.success).toBe(false);
    });

    it("succeeds with valid hours (1-4) and non-empty reason", () => {
      const result = validateActionPayload("REQUEST_EXTENSION", {
        requestedHours: 2,
        reason: "Complex alignment of boiler feed flange taking longer than anticipated.",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("LOG_ENTRY_EXIT action payload", () => {
    it("fails when personName is missing or whitespace", () => {
      const result = validateActionPayload("LOG_ENTRY_EXIT", { direction: "ENTRY", personName: "  " });
      expect(result.success).toBe(false);
    });

    it("fails when direction is invalid", () => {
      const result = validateActionPayload("LOG_ENTRY_EXIT", { direction: "SIDEWAYS", personName: "John Doe" });
      expect(result.success).toBe(false);
    });

    it("succeeds with valid ENTRY event", () => {
      const result = validateActionPayload("LOG_ENTRY_EXIT", {
        direction: "ENTRY",
        personName: "Aakash Gupta",
      });
      expect(result.success).toBe(true);
    });
  });
});
