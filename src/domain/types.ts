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
  | "REQUEST_EXTENSION"
  | "APPROVE_EXTENSION"
  | "REJECT_EXTENSION";

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface AreaData {
  id: string;
  plantId: string;
  code: string;
  name: string;
  ownerId: string;
}

export interface EquipmentData {
  id: string;
  areaId: string;
  tagNumber: string;
  name: string;
  criticality: string;
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
  areaId: string;
  plantId: string;
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
  createdAt: Date;
  updatedAt: Date;

  // Populated relations
  area?: AreaData;
  approvals?: ApprovalData[];
}
