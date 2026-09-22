import { Prisma } from "@prisma/client";

export interface AuditEntryParams {
  permitId?: string | null;
  actorId?: string | null;
  actorLabel: string;
  actorRole: string;
  action: string;
  field?: string | null;
  fromValue?: string | null;
  toValue?: string | null;
  comment?: string | null;
  metadata?: Record<string, unknown> | null;
}

export function buildAuditLogData(params: AuditEntryParams): Prisma.AuditLogCreateManyPermitInput {
  return {
    actorId: params.actorId ?? null,
    actorLabel: params.actorLabel,
    actorRole: params.actorRole,
    action: params.action,
    field: params.field ?? null,
    fromValue: params.fromValue ?? null,
    toValue: params.toValue ?? null,
    comment: params.comment ?? null,
    metadata: params.metadata ? (params.metadata as Prisma.InputJsonValue) : Prisma.JsonNull,
  };
}
