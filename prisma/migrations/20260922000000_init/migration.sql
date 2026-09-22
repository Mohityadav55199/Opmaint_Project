-- CreateEnum
CREATE TYPE "Role" AS ENUM ('REQUESTER', 'AREA_OWNER', 'SAFETY_OFFICER', 'ADMIN');

-- CreateEnum
CREATE TYPE "PermitStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ACTIVE', 'SUSPENDED', 'REJECTED', 'EXPIRED', 'CLOSED', 'CLOSED_VERIFIED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApprovalSlot" AS ENUM ('AREA_OWNER', 'SAFETY_OFFICER');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ExtensionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plant" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Area" (
    "id" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Area_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "tagNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "criticality" TEXT NOT NULL DEFAULT 'MEDIUM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permit" (
    "id" TEXT NOT NULL,
    "permitSequence" SERIAL NOT NULL,
    "permitNumber" TEXT NOT NULL,
    "status" "PermitStatus" NOT NULL DEFAULT 'DRAFT',
    "type" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "contractorTeam" TEXT NOT NULL,
    "workDescription" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "plannedStartTime" TIMESTAMP(3) NOT NULL,
    "plannedEndTime" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "actualStartTime" TIMESTAMP(3),
    "actualEndTime" TIMESTAMP(3),
    "hazards" JSONB NOT NULL DEFAULT '[]',
    "ppeRequired" JSONB NOT NULL DEFAULT '[]',
    "precautionsChecklist" JSONB NOT NULL DEFAULT '{}',
    "typeData" JSONB NOT NULL DEFAULT '{}',
    "approvalRound" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "rejectionReason" TEXT,
    "suspensionReason" TEXT,
    "cancellationReason" TEXT,
    "workCompletionNotes" TEXT,
    "closureVerifiedNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Permit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "permitId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "slot" "ApprovalSlot" NOT NULL,
    "approverId" TEXT NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "comment" TEXT,
    "signatureSvg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkLogEntry" (
    "id" TEXT NOT NULL,
    "permitId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntryExitLog" (
    "id" TEXT NOT NULL,
    "permitId" TEXT NOT NULL,
    "workerName" TEXT NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exitedAt" TIMESTAMP(3),
    "attendantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntryExitLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermitExtension" (
    "id" TEXT NOT NULL,
    "permitId" TEXT NOT NULL,
    "requestedHours" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ExtensionStatus" NOT NULL DEFAULT 'PENDING',
    "requesterId" TEXT NOT NULL,
    "approverId" TEXT,
    "previousExpiresAt" TIMESTAMP(3) NOT NULL,
    "newExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PermitExtension_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "permitId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorLabel" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "field" TEXT,
    "fromValue" TEXT,
    "toValue" TEXT,
    "comment" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_email_idx" ON "User"("email");
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Plant_code_key" ON "Plant"("code");

-- CreateIndex
CREATE INDEX "Area_ownerId_idx" ON "Area"("ownerId");
CREATE UNIQUE INDEX "Area_plantId_code_key" ON "Area"("plantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_tagNumber_key" ON "Equipment"("tagNumber");
CREATE INDEX "Equipment_areaId_idx" ON "Equipment"("areaId");

-- CreateIndex
CREATE UNIQUE INDEX "Permit_permitNumber_key" ON "Permit"("permitNumber");
CREATE INDEX "Permit_status_idx" ON "Permit"("status");
CREATE INDEX "Permit_type_idx" ON "Permit"("type");
CREATE INDEX "Permit_areaId_idx" ON "Permit"("areaId");
CREATE INDEX "Permit_plantId_idx" ON "Permit"("plantId");
CREATE INDEX "Permit_requesterId_idx" ON "Permit"("requesterId");
CREATE INDEX "Permit_expiresAt_idx" ON "Permit"("expiresAt");
CREATE INDEX "Permit_plannedStartTime_plannedEndTime_idx" ON "Permit"("plannedStartTime", "plannedEndTime");

-- CreateIndex
CREATE INDEX "Approval_permitId_round_idx" ON "Approval"("permitId", "round");
CREATE INDEX "Approval_approverId_idx" ON "Approval"("approverId");
CREATE UNIQUE INDEX "Approval_permitId_round_slot_key" ON "Approval"("permitId", "round", "slot");

-- CreateIndex
CREATE INDEX "WorkLogEntry_permitId_idx" ON "WorkLogEntry"("permitId");

-- CreateIndex
CREATE INDEX "EntryExitLog_permitId_idx" ON "EntryExitLog"("permitId");

-- CreateIndex
CREATE INDEX "PermitExtension_permitId_idx" ON "PermitExtension"("permitId");

-- CreateIndex
CREATE INDEX "AuditLog_permitId_createdAt_idx" ON "AuditLog"("permitId", "createdAt");

-- AddForeignKey
ALTER TABLE "Area" ADD CONSTRAINT "Area_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Area" ADD CONSTRAINT "Area_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Permit" ADD CONSTRAINT "Permit_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Permit" ADD CONSTRAINT "Permit_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Permit" ADD CONSTRAINT "Permit_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "Plant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Permit" ADD CONSTRAINT "Permit_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_permitId_fkey" FOREIGN KEY ("permitId") REFERENCES "Permit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkLogEntry" ADD CONSTRAINT "WorkLogEntry_permitId_fkey" FOREIGN KEY ("permitId") REFERENCES "Permit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkLogEntry" ADD CONSTRAINT "WorkLogEntry_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryExitLog" ADD CONSTRAINT "EntryExitLog_permitId_fkey" FOREIGN KEY ("permitId") REFERENCES "Permit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EntryExitLog" ADD CONSTRAINT "EntryExitLog_attendantId_fkey" FOREIGN KEY ("attendantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermitExtension" ADD CONSTRAINT "PermitExtension_permitId_fkey" FOREIGN KEY ("permitId") REFERENCES "Permit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PermitExtension" ADD CONSTRAINT "PermitExtension_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PermitExtension" ADD CONSTRAINT "PermitExtension_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_permitId_fkey" FOREIGN KEY ("permitId") REFERENCES "Permit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- PostgreSQL Trigger to enforce AuditLog immutability (append-only)
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'AuditLog entries are immutable and cannot be updated or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_audit_log_immutability
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_log_modification();
