import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import fs from "fs";
import EmbeddedPostgres from "embedded-postgres";
import { PrismaClient } from "@prisma/client";

const DB_PORT = 54328;
const DB_NAME = "opmaint_integration_test";
const TEST_DATABASE_URL = `postgresql://postgres:password@localhost:${DB_PORT}/${DB_NAME}?schema=public`;

describe("PostgreSQL Real Database Integration & Constraints", { timeout: 30000 }, () => {
  let pgServer: EmbeddedPostgres;
  let prisma: PrismaClient;

  // Shared records for tests
  let testEquipmentId: string;
  let testRequesterId: string;
  let testSafetyOfficerId: string;
  let testPermitId: string;

  beforeAll(async () => {
    // 0. Kill any lingering process listening on DB_PORT
    try {
      execSync(
        `powershell -Command "Get-NetTCPConnection -LocalPort ${DB_PORT} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`,
        { stdio: "ignore" }
      );
    } catch {}

    const isAlreadyInitialized = fs.existsSync(".embedded-pg-test-data/PG_VERSION");
    if (!isAlreadyInitialized && fs.existsSync(".embedded-pg-test-data")) {
      try {
        fs.rmSync(".embedded-pg-test-data", { recursive: true, force: true });
      } catch {}
    }

    // 1. Initialize and start real PostgreSQL engine
    pgServer = new EmbeddedPostgres({
      port: DB_PORT,
      databaseDir: ".embedded-pg-test-data",
      user: "postgres",
      password: "password",
      persistent: true,
      onLog: () => {},
      onError: () => {},
    });

    if (!fs.existsSync(".embedded-pg-test-data/PG_VERSION")) {
      await pgServer.initialise();
    }
    await pgServer.start();

    // Ensure clean database for test run (drop if exists from previous run)
    try {
      await pgServer.dropDatabase(DB_NAME);
    } catch {}
    await pgServer.createDatabase(DB_NAME);

    // 2. Set environment and apply migrations using real Prisma migrate deploy
    process.env.DATABASE_URL = TEST_DATABASE_URL;

    execSync("npx prisma migrate deploy", {
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      stdio: "pipe",
    });

    // 3. Connect real Prisma client
    prisma = new PrismaClient({
      datasources: {
        db: { url: TEST_DATABASE_URL },
      },
    });
    await prisma.$connect();

    // 4. Seed initial valid hierarchy
    const plant = await prisma.plant.create({
      data: { code: "PLANT_INT", name: "Integration Plant", timezone: "Asia/Kolkata" },
    });

    const areaOwner = await prisma.user.create({
      data: {
        email: "area_owner_int@opmaint.local",
        name: "Area Owner Int",
        role: "AREA_OWNER",
        passwordHash: "hash",
      },
    });

    const area = await prisma.area.create({
      data: {
        plantId: plant.id,
        code: "AREA_INT",
        name: "Integration Area",
        ownerId: areaOwner.id,
      },
    });

    const equip = await prisma.equipment.create({
      data: {
        areaId: area.id,
        name: "Integration Equipment",
        tagNumber: "TAG-INT-01",
      },
    });
    testEquipmentId = equip.id;

    const requester = await prisma.user.create({
      data: {
        email: "requester_int@opmaint.local",
        name: "Requester Int",
        role: "REQUESTER",
        passwordHash: "hash",
      },
    });
    testRequesterId = requester.id;

    const safetyOfficer = await prisma.user.create({
      data: {
        email: "safety_int@opmaint.local",
        name: "Safety Officer Int",
        role: "SAFETY_OFFICER",
        passwordHash: "hash",
      },
    });
    testSafetyOfficerId = safetyOfficer.id;

    const now = new Date();
    const permit = await prisma.permit.create({
      data: {
        permitSequence: 1,
        permitNumber: "PTW-2026-INT01",
        status: "ACTIVE",
        type: "HOT_WORK",
        requesterId: requester.id,
        contractorTeam: "Maintenance Alpha",
        workDescription: "Header pipeline welding",
        equipmentId: equip.id,
        plannedStartTime: now,
        plannedEndTime: new Date(now.getTime() + 1000 * 60 * 60 * 4),
        expiresAt: new Date(now.getTime() + 1000 * 60 * 60 * 4),
        hazards: ["HOT_SURFACES"],
        ppeRequired: ["HELMET", "SAFETY_SHOES"],
        precautionsChecklist: { fire_watch: true },
        typeData: {},
      },
    });
    testPermitId = permit.id;
  }, 180000);

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
    if (pgServer) {
      try {
        await pgServer.stop();
      } catch {}
    }
  }, 30000);

  it(
    "applies migration cleanly with zero drift reported by prisma migrate status",
    () => {
      const statusOutput = execSync("npx prisma migrate status", {
        env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
        encoding: "utf-8",
      });

      expect(statusOutput).toMatch(/Database schema is up to date/);
    },
    30000
  );

  describe("AuditLog Immutability Trigger (Real PostgreSQL PL/pgSQL Trigger)", () => {
    it("strictly blocks UPDATE operations on AuditLog table via trigger", async () => {
      const auditEntry = await prisma.auditLog.create({
        data: {
          permitId: testPermitId,
          actorId: testSafetyOfficerId,
          actorLabel: "Safety Officer Int",
          actorRole: "SAFETY_OFFICER",
          action: "TEST_AUDIT",
          field: "status",
          fromValue: "DRAFT",
          toValue: "PENDING_APPROVAL",
        },
      });

      // Attempt to UPDATE the audit row - must trigger exception
      let updateError: Error | null = null;
      try {
        await prisma.$executeRawUnsafe(
          `UPDATE "AuditLog" SET "toValue" = 'TAMPERED' WHERE id = '${auditEntry.id}'`
        );
      } catch (err: unknown) {
        updateError = err as Error;
      }

      expect(updateError).not.toBeNull();
      expect(updateError?.message).toMatch(
        /AuditLog entries are immutable and cannot be updated or deleted/
      );
    });

    it("strictly blocks DELETE operations on AuditLog table via trigger", async () => {
      const auditEntry = await prisma.auditLog.create({
        data: {
          permitId: testPermitId,
          actorId: testSafetyOfficerId,
          actorLabel: "Safety Officer Int",
          actorRole: "SAFETY_OFFICER",
          action: "DELETE_TEST",
        },
      });

      // Attempt to DELETE the audit row - must trigger exception
      let deleteError: Error | null = null;
      try {
        await prisma.$executeRawUnsafe(
          `DELETE FROM "AuditLog" WHERE id = '${auditEntry.id}'`
        );
      } catch (err: unknown) {
        deleteError = err as Error;
      }

      expect(deleteError).not.toBeNull();
      expect(deleteError?.message).toMatch(
        /AuditLog entries are immutable and cannot be updated or deleted/
      );
    });

    it("enforces foreign key RESTRICT: cannot delete user or permit referenced by AuditLog", async () => {
      const dedicatedUser = await prisma.user.create({
        data: {
          email: "immutable_ref@opmaint.local",
          name: "Reference Test User",
          role: "REQUESTER",
          passwordHash: "hash",
        },
      });

      await prisma.auditLog.create({
        data: {
          permitId: testPermitId,
          actorId: dedicatedUser.id,
          actorLabel: dedicatedUser.name,
          actorRole: "REQUESTER",
          action: "CREATION",
        },
      });

      // Attempt deleting user referenced by AuditLog
      let deleteUserError: Error | null = null;
      try {
        await prisma.user.delete({ where: { id: dedicatedUser.id } });
      } catch (err: unknown) {
        deleteUserError = err as Error;
      }

      expect(deleteUserError).not.toBeNull();
      expect(deleteUserError?.message).toMatch(
        /violates RESTRICT setting of foreign key constraint|Foreign key constraint failed|P2003/i
      );
    });
  });

  describe("Approval Unique Constraints", () => {
    it("enforces @@unique([permitId, round, approverId]) to prevent duplicate approvals in same round", async () => {
      const approver = await prisma.user.create({
        data: {
          email: "approver_round_1@opmaint.local",
          name: "Approver Round 1",
          role: "SAFETY_OFFICER",
          passwordHash: "hash",
        },
      });

      // 1st approval by approver in round 1
      await prisma.approval.create({
        data: {
          permitId: testPermitId,
          round: 1,
          slot: "SAFETY_OFFICER",
          approverId: approver.id,
          decision: "APPROVED",
        },
      });

      // Attempt 2nd approval by same approver in round 1 -> must fail unique constraint
      let dupError: { code?: string } | null = null;
      try {
        await prisma.approval.create({
          data: {
            permitId: testPermitId,
            round: 1,
            slot: "AREA_OWNER",
            approverId: approver.id,
            decision: "APPROVED",
          },
        });
      } catch (err: unknown) {
        dupError = err as { code?: string };
      }

      expect(dupError).not.toBeNull();
      expect(dupError?.code).toBe("P2002"); // Prisma unique constraint violation
    });

    it("enforces @@unique([permitId, round, slot]) to prevent duplicate slots in same round", async () => {
      const secondApprover = await prisma.user.create({
        data: {
          email: "approver_round_2@opmaint.local",
          name: "Approver Round 2",
          role: "SAFETY_OFFICER",
          passwordHash: "hash",
        },
      });

      // Attempt to fill SAFETY_OFFICER slot again in round 1 (already filled in previous test)
      let dupSlotError: { code?: string } | null = null;
      try {
        await prisma.approval.create({
          data: {
            permitId: testPermitId,
            round: 1,
            slot: "SAFETY_OFFICER",
            approverId: secondApprover.id,
            decision: "APPROVED",
          },
        });
      } catch (err: unknown) {
        dupSlotError = err as { code?: string };
      }

      expect(dupSlotError).not.toBeNull();
      expect(dupSlotError?.code).toBe("P2002");
    });
  });

  describe("Permit and PermitExtension CHECK Constraints", () => {
    it("enforces permit_planned_time_check (plannedEndTime > plannedStartTime)", async () => {
      const now = new Date();
      let checkError: Error | null = null;
      try {
        await prisma.$executeRawUnsafe(`
          INSERT INTO "Permit" (
            id, "permitSequence", "permitNumber", status, type, "requesterId",
            "contractorTeam", "workDescription", "equipmentId",
            "plannedStartTime", "plannedEndTime", "expiresAt",
            hazards, "ppeRequired", "precautionsChecklist", "typeData",
            "approvalRound", version, "createdAt", "updatedAt"
          ) VALUES (
            'permit_chk_1', 999, 'PTW-CHK-01', 'DRAFT', 'HOT_WORK', '${testRequesterId}',
            'Team', 'Desc', '${testEquipmentId}',
            '${new Date(now.getTime() + 10000).toISOString()}',
            '${new Date(now.getTime()).toISOString()}',
            '${new Date(now.getTime() + 20000).toISOString()}',
            '["HOT_SURFACES"]'::jsonb, '["HELMET"]'::jsonb, '{}'::jsonb, '{}'::jsonb,
            1, 1, NOW(), NOW()
          );
        `);
      } catch (err: unknown) {
        checkError = err as Error;
      }

      expect(checkError).not.toBeNull();
      expect(checkError?.message).toMatch(/chk_permit_planned_time|permit_planned_time_check/);
    });

    it("enforces permit_validity_boundary_check (expiresAt >= plannedEndTime)", async () => {
      const now = new Date();
      let checkError: Error | null = null;
      try {
        await prisma.$executeRawUnsafe(`
          INSERT INTO "Permit" (
            id, "permitSequence", "permitNumber", status, type, "requesterId",
            "contractorTeam", "workDescription", "equipmentId",
            "plannedStartTime", "plannedEndTime", "expiresAt",
            hazards, "ppeRequired", "precautionsChecklist", "typeData",
            "approvalRound", version, "createdAt", "updatedAt"
          ) VALUES (
            'permit_chk_2', 998, 'PTW-CHK-02', 'DRAFT', 'HOT_WORK', '${testRequesterId}',
            'Team', 'Desc', '${testEquipmentId}',
            '${new Date(now.getTime()).toISOString()}',
            '${new Date(now.getTime() + 10000).toISOString()}',
            '${new Date(now.getTime() + 5000).toISOString()}',
            '["HOT_SURFACES"]'::jsonb, '["HELMET"]'::jsonb, '{}'::jsonb, '{}'::jsonb,
            1, 1, NOW(), NOW()
          );
        `);
      } catch (err: unknown) {
        checkError = err as Error;
      }

      expect(checkError).not.toBeNull();
      expect(checkError?.message).toMatch(/chk_permit_expires_after_planned|permit_validity_boundary_check/);
    });

    it("enforces permit_extension_hours_check (requestedHours > 0)", async () => {
      let checkError: Error | null = null;
      try {
        await prisma.$executeRawUnsafe(`
          INSERT INTO "PermitExtension" (
            id, "permitId", "requesterId", "requestedHours", reason, status, "previousExpiresAt", "createdAt", "updatedAt"
          ) VALUES (
            'ext_chk_1', '${testPermitId}', '${testRequesterId}', 0, 'Reason', 'PENDING', NOW(), NOW(), NOW()
          );
        `);
      } catch (err: unknown) {
        checkError = err as Error;
      }

      expect(checkError).not.toBeNull();
      expect(checkError?.message).toMatch(/chk_extension_hours|permit_extension_hours_check/);
    });

    it("enforces partial unique index PermitExtension_single_pending", async () => {
      const permit = await prisma.permit.findUniqueOrThrow({
        where: { id: testPermitId },
      });

      // 1st pending extension
      await prisma.permitExtension.create({
        data: {
          permitId: testPermitId,
          requesterId: testRequesterId,
          requestedHours: 2,
          reason: "First pending extension",
          status: "PENDING",
          previousExpiresAt: permit.expiresAt,
        },
      });

      // Attempt 2nd pending extension on same permit
      let dupPendingError: Error | null = null;
      try {
        await prisma.permitExtension.create({
          data: {
            permitId: testPermitId,
            requesterId: testRequesterId,
            requestedHours: 1,
            reason: "Second pending extension",
            status: "PENDING",
            previousExpiresAt: permit.expiresAt,
          },
        });
      } catch (err: unknown) {
        dupPendingError = err as Error;
      }

      expect(dupPendingError).not.toBeNull();
      expect(dupPendingError?.message).toMatch(/Unique constraint failed on the fields: \(`permitId`\)|PermitExtension_single_pending/);
    });
  });
});
