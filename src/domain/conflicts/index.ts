export interface PermitTimeLocation {
  id?: string;
  type: string;
  areaId: string;
  equipmentId: string;
  plannedStartTime: Date | string;
  expiresAt: Date | string;
  status: string;
  permitNumber?: string;
}

export interface ConflictWarning {
  conflictingPermitId: string;
  conflictingPermitNumber: string;
  conflictType: "HOT_WORK_VS_CONFINED_SPACE" | "SAME_EQUIPMENT_OVERLAP";
  severity: "CRITICAL_WARNING" | "ADVISORY";
  message: string;
}

/**
 * Checks for spatial-temporal conflicts between hot work and confined space permits.
 * Returns structured warnings to alert approvers and plant personnel.
 */
export function detectPermitConflicts(
  candidate: PermitTimeLocation,
  existingPermits: PermitTimeLocation[]
): ConflictWarning[] {
  const warnings: ConflictWarning[] = [];
  const candidateStart = new Date(candidate.plannedStartTime).getTime();
  const candidateEnd = new Date(candidate.expiresAt).getTime();

  for (const existing of existingPermits) {
    // Ignore self
    if (candidate.id && existing.id === candidate.id) continue;

    // Only compare against active, approved, or pending approval permits
    if (!["ACTIVE", "APPROVED", "PENDING_APPROVAL"].includes(existing.status)) continue;

    const existingStart = new Date(existing.plannedStartTime).getTime();
    const existingEnd = new Date(existing.expiresAt).getTime();

    // Check temporal overlap: max(start1, start2) < min(end1, end2)
    const hasTimeOverlap = Math.max(candidateStart, existingStart) < Math.min(candidateEnd, existingEnd);
    if (!hasTimeOverlap) continue;

    // Condition 1: Hot Work vs Confined Space Entry in same Area or Equipment
    const isHotAndConfined =
      (candidate.type === "HOT_WORK" && existing.type === "CONFINED_SPACE_ENTRY") ||
      (candidate.type === "CONFINED_SPACE_ENTRY" && existing.type === "HOT_WORK");

    if (isHotAndConfined && (candidate.areaId === existing.areaId || candidate.equipmentId === existing.equipmentId)) {
      warnings.push({
        conflictingPermitId: existing.id || "unknown",
        conflictingPermitNumber: existing.permitNumber || "Existing Permit",
        conflictType: "HOT_WORK_VS_CONFINED_SPACE",
        severity: "CRITICAL_WARNING",
        message: `Hazardous SIMOPS Conflict: Hot Work overlaps with Confined Space Entry permit (${existing.permitNumber || existing.type}) in the same area/equipment. Spark and atmospheric hazards must be isolated.`,
      });
    }

    // Condition 2: Exact same equipment being worked simultaneously
    if (candidate.equipmentId === existing.equipmentId) {
      warnings.push({
        conflictingPermitId: existing.id || "unknown",
        conflictingPermitNumber: existing.permitNumber || "Existing Permit",
        conflictType: "SAME_EQUIPMENT_OVERLAP",
        severity: "ADVISORY",
        message: `Equipment Overlap: Permit ${existing.permitNumber || existing.id} is already scheduled or active on the same equipment during this timeframe.`,
      });
    }
  }

  return warnings;
}
