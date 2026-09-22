export type Role = "REQUESTER" | "AREA_OWNER" | "SAFETY_OFFICER" | "ADMIN";

export type PermitStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "ACTIVE"
  | "SUSPENDED"
  | "REJECTED"
  | "EXPIRED"
  | "CLOSED"
  | "CLOSED_VERIFIED"
  | "CANCELLED";

export type ApprovalSlot = "AREA_OWNER" | "SAFETY_OFFICER";
export type ApprovalDecision = "APPROVED" | "REJECTED";
export type ExtensionStatus = "PENDING" | "APPROVED" | "REJECTED";
export type EntryExitDirection = "ENTRY" | "EXIT";

export type PermitAction =
  | "SUBMIT"
  | "APPROVE"
  | "REJECT"
  | "ACTIVATE"
  | "SUSPEND"
  | "RESUME"
  | "CLOSE"
  | "VERIFY_CLOSURE"
  | "CANCEL"
  | "EDIT"
  | "LOG_WORK"
  | "LOG_ENTRY_EXIT"
  | "REQUEST_EXTENSION"
  | "APPROVE_EXTENSION"
  | "REJECT_EXTENSION"
  | "EXPIRE";

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive?: boolean;
}

export interface PlantData {
  id: string;
  code: string;
  name: string;
  timezone: string;
}

export interface AreaData {
  id: string;
  plantId: string;
  code: string;
  name: string;
  ownerId: string;
  plant?: PlantData;
}

export interface EquipmentData {
  id: string;
  areaId: string;
  tagNumber: string;
  name: string;
  criticality: string;
  area?: AreaData;
}

export interface ApprovalData {
  id: string;
  permitId: string;
  round: number;
  slot: ApprovalSlot;
  approverId: string;
  decision: ApprovalDecision;
  comment?: string | null;
  signatureSvg?: string | null;
  createdAt: Date;
}

export interface EntryExitLogData {
  id: string;
  permitId: string;
  direction: EntryExitDirection;
  personName: string;
  at: Date;
  recordedById: string;
  createdAt: Date;
}

export interface PermitData {
  id: string;
  permitSequence: number;
  permitNumber: string;
  status: PermitStatus;
  type: string;
  requesterId: string;
  contractorTeam: string;
  workDescription: string;
  equipmentId: string;
  areaId?: string; // Derived from equipment.area.id
  plantId?: string; // Derived from equipment.area.plantId
  plannedStartTime: Date;
  plannedEndTime: Date; // Originally planned/requested end time
  expiresAt: Date; // Authoritative validity boundary
  actualStartTime?: Date | null;
  actualEndTime?: Date | null;
  hazards: string[];
  ppeRequired: string[];
  precautionsChecklist: Record<string, boolean>;
  typeData: Record<string, unknown>;
  approvalRound: number;
  version: number;
  rejectionReason?: string | null;
  suspensionReason?: string | null;
  cancellationReason?: string | null;
  workCompletionNotes?: string | null;
  closureVerifiedNotes?: string | null;
  activatedById?: string | null;
  suspendedById?: string | null;
  closedById?: string | null;
  createdAt: Date;
  updatedAt: Date;

  // Populated relations
  equipment?: EquipmentData;
  area?: AreaData; // Populated from equipment.area
  approvals?: ApprovalData[];
  entryExitLogs?: EntryExitLogData[];
  extensions?: { id?: string; status: ExtensionStatus; requestedHours: number; reason?: string }[];
}

