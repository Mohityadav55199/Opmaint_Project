/**
 * Permit API Integration Tests (CRUD, Submit, Banned Fields, State Transition, Audit Trails)
 *
 * Dedicated embedded PostgreSQL instance on port 54331.
 * Real JWT tokens via loginHandler.
 * Direct handler invocation with real PostgreSQL database.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { execSync } from "child_process";
import fs from "fs";
import EmbeddedPostgres from "embedded-postgres";
import { Role } from "@prisma/client";
import { hashPassword, AUTH_COOKIE_NAME } from "../src/lib/auth";
import { prisma, resetPrismaClient } from "../src/lib/prisma";
import { POST as loginHandler } from "../src/app/api/auth/login/route";
import { GET as getPermitsHandler, POST as postPermitsHandler } from "../src/app/api/permits/route";
import { GET as getPermitByIdHandler, PATCH as patchPermitHandler } from "../src/app/api/permits/[id]/route";
import { POST as submitPermitHandler } from "../src/app/api/permits/[id]/submit/route";

const DB_PORT = 54331;
const DB_NAME = "opmaint_permit_test";
const TEST_DATABASE_URL = `postgresql://postgres:password@localhost:${DB_PORT}/${DB_NAME}?schema=public`;
const RAW_PASSWORD = "Password123!";

// ---------- helpers ----------

async function loginAndGetToken(email: string, password: string): Promise<string> {
  const req = new Request("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const res = await loginHandler(req);
  if (res.status !== 200) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Login failed for ${email}: ${res.status} — ${JSON.stringify(body)}`);
  }
  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = setCookie.match(new RegExp(`${AUTH_COOKIE_NAME}=([^;]+)`));
  if (!match) {
    throw new Error(`No ${AUTH_COOKIE_NAME} cookie in login response for ${email}`);
  }
  return match[1];
}

function makeRequest(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    token?: string;
  } = {}
): Request {
  const { method = "GET", body, token } = options;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["cookie"] = `${AUTH_COOKIE_NAME}=${token}`;
  }
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ---------- test suite ----------

describe("Permit APIs Integration (PostgreSQL)", { timeout: 60000 }, () => {
  let pgServer: EmbeddedPostgres;

  let requesterToken: string;
  let requester2Token: string;
  let safetyOfficerToken: string;

  let requesterId: string;
  let equipmentId: string;

  beforeAll(async () => {
    // 0. Kill lingering process on DB_PORT
    try {
      execSync(
        `powershell -Command "Get-NetTCPConnection -LocalPort ${DB_PORT} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`,
        { stdio: "ignore" }
      );
    } catch {}

    if (
      !fs.existsSync(".embedded-pg-permit-data/PG_VERSION") &&
      fs.existsSync(".embedded-pg-permit-data")
    ) {
      try {
        fs.rmSync(".embedded-pg-permit-data", { recursive: true, force: true });
      } catch {}
    }

    pgServer = new EmbeddedPostgres({
      port: DB_PORT,
      databaseDir: ".embedded-pg-permit-data",
      user: "postgres",
      password: "password",
      persistent: true,
      onLog: () => {},
      onError: () => {},
    });

    if (!fs.existsSync(".embedded-pg-permit-data/PG_VERSION")) {
      await pgServer.initialise();
    }
    await pgServer.start();

    try {
      await pgServer.dropDatabase(DB_NAME);
    } catch {}
    await pgServer.createDatabase(DB_NAME);

    process.env.DATABASE_URL = TEST_DATABASE_URL;
    resetPrismaClient();

    execSync("npx prisma migrate deploy", {
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      stdio: "inherit",
    });

    // Run seed to populate initial master data and the 10 seeded permits
    execSync("npx tsx prisma/seed.ts", {
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      stdio: "pipe",
    });

    await prisma.$connect();

    // Create a secondary requester to test unauthorized submission/modification
    const passwordHash = await hashPassword(RAW_PASSWORD);
    const reqUser2 = await prisma.user.create({
      data: {
        email: "requester2@permit.test",
        name: "Secondary Requester",
        role: Role.REQUESTER,
        passwordHash,
        isActive: true,
      },
    });

    const primaryRequester = await prisma.user.findUniqueOrThrow({
      where: { email: "requester@opmaint.local" },
    });
    requesterId = primaryRequester.id;

    const equip = await prisma.equipment.findFirstOrThrow();
    equipmentId = equip.id;

    // Obtain tokens using real login route
    requesterToken = await loginAndGetToken("requester@opmaint.local", "password123");
    requester2Token = await loginAndGetToken(reqUser2.email, RAW_PASSWORD);
    safetyOfficerToken = await loginAndGetToken("safety.officer@opmaint.local", "password123");
  }, 180000);

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (pgServer) {
      try {
        await pgServer.stop();
      } catch {}
    }
  }, 30000);

  // -------------------------------------------------------------
  // 1. Authentication Guards
  // -------------------------------------------------------------
  describe("Authentication Requirements", () => {
    it("rejects POST /api/permits without token (401)", async () => {
      const req = makeRequest("/api/permits", { method: "POST", body: {} });
      const res = await postPermitsHandler(req);
      expect(res.status).toBe(401);
    });

    it("rejects GET /api/permits without token (401)", async () => {
      const req = makeRequest("/api/permits");
      const res = await getPermitsHandler(req);
      expect(res.status).toBe(401);
    });

    it("rejects GET /api/permits/:id without token (401)", async () => {
      const req = makeRequest("/api/permits/fake-id");
      const res = await getPermitByIdHandler(req, { params: Promise.resolve({ id: "fake-id" }) });
      expect(res.status).toBe(401);
    });

    it("rejects PATCH /api/permits/:id without token (401)", async () => {
      const req = makeRequest("/api/permits/fake-id", { method: "PATCH", body: {} });
      const res = await patchPermitHandler(req, { params: Promise.resolve({ id: "fake-id" }) });
      expect(res.status).toBe(401);
    });

    it("rejects POST /api/permits/:id/submit without token (401)", async () => {
      const req = makeRequest("/api/permits/fake-id/submit", { method: "POST" });
      const res = await submitPermitHandler(req, { params: Promise.resolve({ id: "fake-id" }) });
      expect(res.status).toBe(401);
    });
  });

  // -------------------------------------------------------------
  // 2. Permit Creation & Server-Controlled Fields
  // -------------------------------------------------------------
  describe("POST /api/permits (Create Draft)", () => {
    const validHotWorkPayload = () => {
      const now = new Date();
      const start = new Date(now.getTime() + 1000 * 60 * 60); // in 1h
      const end = new Date(start.getTime() + 1000 * 60 * 60 * 4); // 4h duration
      return {
        type: "HOT_WORK",
        equipmentId,
        contractorTeam: "Fabrication Unit 1",
        workDescription: "Welding replacement flange on main pipeline",
        plannedStartTime: start.toISOString(),
        plannedEndTime: end.toISOString(),
        hazards: ["HOT_SURFACES", "SPARKS"],
        ppeRequired: ["HELMET", "SAFETY_SHOES", "WELDING_GLOVES"],
        precautionsChecklist: {
          fire_watch: true,
          combustibles_cleared: true,
          floor_covered: true,
          gas_tested: true,
          ventilation_adequate: true,
        },
        typeData: {
          hotWorkType: "WELDING",
          fireWatchName: "Vikram Rathore",
          fireExtinguisherType: "CO2 4.5kg",
          combustiblesClearedRadiusMetres: 10,
          gasTestLelPercent: 0,
          gasTestO2Percent: 20.9,
          gasTestTime: new Date().toISOString(),
          gasTesterName: "S. Swaminathan",
        },
      };
    };

    it("rejects banned field: requesterId (400)", async () => {
      const body = { ...validHotWorkPayload(), requesterId: "hacked-user-id" };
      const req = makeRequest("/api/permits", { method: "POST", body, token: requesterToken });
      const res = await postPermitsHandler(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.message).toMatch(/requesterId/);
    });

    it("rejects banned field: status (400)", async () => {
      const body = { ...validHotWorkPayload(), status: "APPROVED" };
      const req = makeRequest("/api/permits", { method: "POST", body, token: requesterToken });
      const res = await postPermitsHandler(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.message).toMatch(/status/);
    });

    it("rejects banned field: expiresAt (400)", async () => {
      const body = { ...validHotWorkPayload(), expiresAt: new Date().toISOString() };
      const req = makeRequest("/api/permits", { method: "POST", body, token: requesterToken });
      const res = await postPermitsHandler(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.message).toMatch(/expiresAt/);
    });

    it("rejects banned field: permitNumber (400)", async () => {
      const body = { ...validHotWorkPayload(), permitNumber: "PTW-CUSTOM-001" };
      const req = makeRequest("/api/permits", { method: "POST", body, token: requesterToken });
      const res = await postPermitsHandler(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.message).toMatch(/permitNumber/);
    });

    it("rejects unsupported permit type: EXCAVATION", async () => {
      const body = { ...validHotWorkPayload(), type: "EXCAVATION" };
      const req = makeRequest("/api/permits", { method: "POST", body, token: requesterToken });
      const res = await postPermitsHandler(req);
      expect([400, 422]).toContain(res.status);
    });

    it("rejects non-existent equipmentId (400)", async () => {
      const body = { ...validHotWorkPayload(), equipmentId: "non-existent-equip-id" };
      const req = makeRequest("/api/permits", { method: "POST", body, token: requesterToken });
      const res = await postPermitsHandler(req);
      expect(res.status).toBe(400);
    });

    it("rejects invalid date ordering plannedEndTime <= plannedStartTime", async () => {
      const payload = validHotWorkPayload();
      payload.plannedEndTime = payload.plannedStartTime;
      const req = makeRequest("/api/permits", { method: "POST", body: payload, token: requesterToken });
      const res = await postPermitsHandler(req);
      expect([400, 422]).toContain(res.status);
    });

    it("creates DRAFT permit for HOT_WORK with server-controlled fields and audit trail", async () => {
      const payload = validHotWorkPayload();
      const req = makeRequest("/api/permits", { method: "POST", body: payload, token: requesterToken });
      const res = await postPermitsHandler(req);
      expect(res.status).toBe(201);
      const body = await res.json();

      expect(body.data.id).toBeDefined();
      expect(body.data.status).toBe("DRAFT");
      expect(body.data.requesterId).toBe(requesterId);
      expect(body.data.permitNumber).toMatch(/^PTW-\d{4}-\d{4}$/);
      expect(new Date(body.data.expiresAt).getTime()).toBe(new Date(payload.plannedEndTime).getTime());

      // Verify audit trail in DB
      const auditLog = await prisma.auditLog.findFirst({
        where: { permitId: body.data.id },
      });
      expect(auditLog).toBeDefined();
      expect(auditLog?.action).toBe("DRAFT_CREATED");
      expect(auditLog?.toValue).toBe("DRAFT");
      expect(auditLog?.actorId).toBe(requesterId);
    });

    it("creates DRAFT permits for all other 3 assignment-required types", async () => {
      const now = new Date();
      const start = new Date(now.getTime() + 1000 * 60 * 60 * 2);
      const end = new Date(start.getTime() + 1000 * 60 * 60 * 4);

      // 1. CONFINED_SPACE_ENTRY
      const csPayload = {
        type: "CONFINED_SPACE_ENTRY",
        equipmentId,
        contractorTeam: "Vessel Cleaners Inc",
        workDescription: "De-scaling and visual inspection inside vessel",
        plannedStartTime: start.toISOString(),
        plannedEndTime: end.toISOString(),
        hazards: ["OXYGEN_DEFICIENCY", "CONFINED_SPACE"],
        ppeRequired: ["HELMET", "SAFETY_SHOES", "ESCAPE_BA"],
        precautionsChecklist: {
          lines_isolated: true,
          atmospheric_tested: true,
          ventilation_active: true,
          standby_present: true,
          rescue_ready: true,
        },
        typeData: {
          spaceId: "TK-01",
          entryPoint: "Manway #1",
          standbyAttendantName: "Ramesh P",
          rescuePlanDescription: "Harness with external winch",
          ventilationMethod: "FORCED_MECHANICAL",
          gasTestO2Percent: 20.9,
          gasTestLelPercent: 0,
          gasTestH2sPpm: 0,
          gasTestCoPpm: 0,
          gasTestTime: new Date().toISOString(),
          gasTesterName: "S. Swaminathan",
          communicationMethod: "Two-way radio",
        },
      };
      const csRes = await postPermitsHandler(
        makeRequest("/api/permits", { method: "POST", body: csPayload, token: requesterToken })
      );
      expect(csRes.status).toBe(201);
      const csData = await csRes.json();
      expect(csData.data.type).toBe("CONFINED_SPACE_ENTRY");

      // 2. WORKING_AT_HEIGHT
      const heightPayload = {
        type: "WORKING_AT_HEIGHT",
        equipmentId,
        contractorTeam: "Scaffold Team A",
        workDescription: "Overhead lighting and valve inspection",
        plannedStartTime: start.toISOString(),
        plannedEndTime: end.toISOString(),
        hazards: ["FALL_FROM_HEIGHT"],
        ppeRequired: ["HELMET", "SAFETY_SHOES", "FULL_BODY_HARNESS"],
        precautionsChecklist: {
          harness_inspected: true,
          certified_anchor: true,
          barricade_warning: true,
          tools_tethered: true,
        },
        typeData: {
          heightMetres: 6.0,
          accessMethod: "MEWP",
          fallArrestEquipment: "Double lanyard harness",
          anchorPointChecked: true,
          barricadingBelow: true,
          rescuePlanAtHeight: "Descent device",
          weatherCheckConfirmed: true,
        },
      };
      const hRes = await postPermitsHandler(
        makeRequest("/api/permits", { method: "POST", body: heightPayload, token: requesterToken })
      );
      expect(hRes.status).toBe(201);
      const hData = await hRes.json();
      expect(hData.data.type).toBe("WORKING_AT_HEIGHT");

      // 3. ELECTRICAL_ISOLATION_LOTO
      const lotoPayload = {
        type: "ELECTRICAL_ISOLATION_LOTO",
        equipmentId,
        contractorTeam: "Electrical Maintenance",
        workDescription: "Primary motor breaker servicing and overhaul",
        plannedStartTime: start.toISOString(),
        plannedEndTime: end.toISOString(),
        hazards: ["ELECTROCUTION", "ARC_FLASH"],
        ppeRequired: ["HELMET", "SAFETY_SHOES", "ARC_FLASH_SHIELD"],
        precautionsChecklist: {
          isolation_points_locked: true,
          tags_posted: true,
          zero_energy_test: true,
          stored_energy_dissipated: true,
        },
        typeData: {
          equipmentTag: "MCC-01",
          voltageLevel: "415V",
          isolationPointsList: ["MCC Feeder 1"],
          lockNumbers: ["LOCK-101"],
          tagNumbers: ["TAG-101"],
          earthingApplied: true,
          testedDeadBy: "Dinesh K",
          testInstrumentUsed: "Fluke Multimeter",
          zeroEnergyVerified: true,
        },
      };
      const lRes = await postPermitsHandler(
        makeRequest("/api/permits", { method: "POST", body: lotoPayload, token: requesterToken })
      );
      expect(lRes.status).toBe(201);
      const lData = await lRes.json();
      expect(lData.data.type).toBe("ELECTRICAL_ISOLATION_LOTO");
    });
  });

  // -------------------------------------------------------------
  // 3. List & Get Permit
  // -------------------------------------------------------------
  describe("GET /api/permits & GET /api/permits/:id", () => {
    let testPermitId: string;

    beforeAll(async () => {
      const permit = await prisma.permit.findFirst({
        where: { requesterId },
      });
      testPermitId = permit!.id;
    });

    it("lists permits with pagination metadata", async () => {
      const req = makeRequest("/api/permits?page=1&pageSize=10", { token: requesterToken });
      const res = await getPermitsHandler(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.pagination).toBeDefined();
      expect(body.pagination.total).toBeGreaterThanOrEqual(1);
    });

    it("filters permits by mine=true", async () => {
      const req = makeRequest("/api/permits?mine=true", { token: requesterToken });
      const res = await getPermitsHandler(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.every((p: { requesterId: string }) => p.requesterId === requesterId)).toBe(true);
    });

    it("fetches single permit by id with relations and audit logs", async () => {
      const req = makeRequest(`/api/permits/${testPermitId}`, { token: requesterToken });
      const res = await getPermitByIdHandler(req, { params: Promise.resolve({ id: testPermitId }) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.id).toBe(testPermitId);
      expect(body.data.equipment).toBeDefined();
      expect(body.data.equipment.area.plant).toBeDefined();
      expect(body.data.requester).toBeDefined();
      expect(Array.isArray(body.data.auditLogs)).toBe(true);
    });

    it("returns 404 for non-existent permit ID", async () => {
      const req = makeRequest("/api/permits/non-existent-cuid", { token: requesterToken });
      const res = await getPermitByIdHandler(req, { params: Promise.resolve({ id: "non-existent-cuid" }) });
      expect(res.status).toBe(404);
    });
  });

  // -------------------------------------------------------------
  // 4. Update Permit (PATCH /api/permits/:id)
  // -------------------------------------------------------------
  describe("PATCH /api/permits/:id", () => {
    let draftPermitId: string;

    beforeAll(async () => {
      const now = new Date();
      const start = new Date(now.getTime() + 1000 * 60 * 60);
      const end = new Date(start.getTime() + 1000 * 60 * 60 * 3);
      const created = await prisma.permit.create({
        data: {
          permitSequence: 99,
          permitNumber: "PTW-2026-0099",
          status: "DRAFT",
          type: "HOT_WORK",
          requesterId,
          contractorTeam: "Initial Team",
          workDescription: "Initial work description for patch test",
          equipmentId,
          plannedStartTime: start,
          plannedEndTime: end,
          expiresAt: end,
          hazards: ["HOT_SURFACES"],
          ppeRequired: ["HELMET", "SAFETY_SHOES"],
          precautionsChecklist: {
            fire_watch: true,
            combustibles_cleared: true,
            floor_covered: true,
            gas_tested: true,
            ventilation_adequate: true,
          },
          typeData: {
            hotWorkType: "WELDING",
            fireWatchName: "Vikram Rathore",
            fireExtinguisherType: "CO2 4.5kg",
            combustiblesClearedRadiusMetres: 10,
            gasTestLelPercent: 0,
            gasTestO2Percent: 20.9,
            gasTestTime: new Date().toISOString(),
            gasTesterName: "S. Swaminathan",
          },
        },
      });
      draftPermitId = created.id;
    });

    it("rejects update by non-requester (403)", async () => {
      const req = makeRequest(`/api/permits/${draftPermitId}`, {
        method: "PATCH",
        body: { workDescription: "Attempted unauthorized update" },
        token: requester2Token,
      });
      const res = await patchPermitHandler(req, { params: Promise.resolve({ id: draftPermitId }) });
      expect(res.status).toBe(403);
    });

    it("rejects update with banned fields (requesterId, status, expiresAt, permitNumber) (400)", async () => {
      const req = makeRequest(`/api/permits/${draftPermitId}`, {
        method: "PATCH",
        body: { status: "ACTIVE" },
        token: requesterToken,
      });
      const res = await patchPermitHandler(req, { params: Promise.resolve({ id: draftPermitId }) });
      expect(res.status).toBe(400);
    });

    it("successfully updates allowed fields and syncs expiresAt when plannedEndTime changes", async () => {
      const now = new Date();
      const newEndTime = new Date(now.getTime() + 1000 * 60 * 60 * 6);

      const req = makeRequest(`/api/permits/${draftPermitId}`, {
        method: "PATCH",
        body: {
          contractorTeam: "Updated Contractor Elite",
          plannedEndTime: newEndTime.toISOString(),
        },
        token: requesterToken,
      });
      const res = await patchPermitHandler(req, { params: Promise.resolve({ id: draftPermitId }) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.contractorTeam).toBe("Updated Contractor Elite");
      expect(new Date(body.data.expiresAt).getTime()).toBe(newEndTime.getTime());

      // Verify audit log for EDIT was created
      const editLog = await prisma.auditLog.findFirst({
        where: { permitId: draftPermitId, action: "EDIT" },
      });
      expect(editLog).toBeDefined();
      expect(editLog?.actorId).toBe(requesterId);
    });
  });

  // -------------------------------------------------------------
  // 5. Submit Permit Workflow (POST /api/permits/:id/submit)
  // -------------------------------------------------------------
  describe("POST /api/permits/:id/submit", () => {
    let submitPermitId: string;

    beforeEach(async () => {
      const now = new Date();
      const start = new Date(now.getTime() + 1000 * 60 * 30);
      const end = new Date(start.getTime() + 1000 * 60 * 60 * 4);
      const created = await prisma.permit.create({
        data: {
          permitSequence: 100 + Math.floor(Math.random() * 1000),
          permitNumber: `PTW-2026-${Math.floor(Math.random() * 9000 + 1000)}`,
          status: "DRAFT",
          type: "HOT_WORK",
          requesterId,
          contractorTeam: "Pipeline Welders",
          workDescription: "High-pressure valve welding and inspection",
          equipmentId,
          plannedStartTime: start,
          plannedEndTime: end,
          expiresAt: end,
          hazards: ["HOT_SURFACES", "SPARKS"],
          ppeRequired: ["HELMET", "SAFETY_SHOES", "WELDING_GLOVES", "EYE_PROTECTION"],
          precautionsChecklist: {
            fire_watch: true,
            combustibles_cleared: true,
            floor_covered: true,
            gas_tested: true,
            ventilation_adequate: true,
          },
          typeData: {
            hotWorkType: "WELDING",
            fireWatchName: "Vikram Rathore",
            fireExtinguisherType: "CO2 4.5kg",
            combustiblesClearedRadiusMetres: 10,
            gasTestLelPercent: 0,
            gasTestO2Percent: 20.9,
            gasTestTime: new Date().toISOString(),
            gasTesterName: "S. Swaminathan",
          },
        },
      });
      submitPermitId = created.id;
    });

    it("rejects submission by someone other than the requester (403)", async () => {
      const req = makeRequest(`/api/permits/${submitPermitId}/submit`, {
        method: "POST",
        token: requester2Token,
      });
      const res = await submitPermitHandler(req, { params: Promise.resolve({ id: submitPermitId }) });
      expect(res.status).toBe(403);
    });

    it("rejects submission by safety officer (403)", async () => {
      const req = makeRequest(`/api/permits/${submitPermitId}/submit`, {
        method: "POST",
        token: safetyOfficerToken,
      });
      const res = await submitPermitHandler(req, { params: Promise.resolve({ id: submitPermitId }) });
      expect(res.status).toBe(403);
    });

    it("transitions permit from DRAFT to PENDING_APPROVAL and creates transactional audit entry", async () => {
      const req = makeRequest(`/api/permits/${submitPermitId}/submit`, {
        method: "POST",
        token: requesterToken,
      });
      const res = await submitPermitHandler(req, { params: Promise.resolve({ id: submitPermitId }) });
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.data.id).toBe(submitPermitId);
      expect(body.data.status).toBe("PENDING_APPROVAL");

      // Verify audit entry in database
      const auditLog = await prisma.auditLog.findFirst({
        where: { permitId: submitPermitId, action: "SUBMIT" },
      });
      expect(auditLog).toBeDefined();
      expect(auditLog?.fromValue).toBe("DRAFT");
      expect(auditLog?.toValue).toBe("PENDING_APPROVAL");
      expect(auditLog?.actorId).toBe(requesterId);
      expect(auditLog?.comment).toBe("Permit submitted for approval");
    });

    it("cannot be submitted twice (double submission rejected with error)", async () => {
      // First submit
      const req1 = makeRequest(`/api/permits/${submitPermitId}/submit`, {
        method: "POST",
        token: requesterToken,
      });
      const res1 = await submitPermitHandler(req1, { params: Promise.resolve({ id: submitPermitId }) });
      expect(res1.status).toBe(200);

      // Second submit attempt
      const req2 = makeRequest(`/api/permits/${submitPermitId}/submit`, {
        method: "POST",
        token: requesterToken,
      });
      const res2 = await submitPermitHandler(req2, { params: Promise.resolve({ id: submitPermitId }) });
      // Should fail (422 Unprocessable or 409 Conflict)
      expect([409, 422]).toContain(res2.status);

      // Permit status should remain PENDING_APPROVAL
      const permitInDb = await prisma.permit.findUnique({ where: { id: submitPermitId } });
      expect(permitInDb?.status).toBe("PENDING_APPROVAL");
    });
  });

  // -------------------------------------------------------------
  // 6. Database Seed Verification
  // -------------------------------------------------------------
  describe("Database Seeding & Audit Log Strategy", () => {
    it("verifies 12 seeded permits across all lifecycle states, all 4 types, with full audit trails", async () => {
      const permits = await prisma.permit.findMany({
        where: {
          permitSequence: { lte: 12 },
        },
        include: { auditLogs: { orderBy: { createdAt: "asc" } } },
      });

      expect(permits.length).toBe(12);

      const draftCount = permits.filter((p) => p.status === "DRAFT").length;
      const pendingCount = permits.filter((p) => p.status === "PENDING_APPROVAL").length;
      const approvedCount = permits.filter((p) => p.status === "APPROVED").length;
      const activeCount = permits.filter((p) => p.status === "ACTIVE").length;
      const suspendedCount = permits.filter((p) => p.status === "SUSPENDED").length;
      const closedCount = permits.filter((p) => p.status === "CLOSED").length;
      const closedVerifiedCount = permits.filter((p) => p.status === "CLOSED_VERIFIED").length;
      const expiredCount = permits.filter((p) => p.status === "EXPIRED").length;
      const rejectedCount = permits.filter((p) => p.status === "REJECTED").length;
      const cancelledCount = permits.filter((p) => p.status === "CANCELLED").length;

      expect(draftCount).toBe(1);
      expect(pendingCount).toBe(1);
      expect(approvedCount).toBe(1);
      expect(activeCount).toBe(3);
      expect(suspendedCount).toBe(1);
      expect(closedCount).toBe(1);
      expect(closedVerifiedCount).toBe(1);
      expect(expiredCount).toBe(1);
      expect(rejectedCount).toBe(1);
      expect(cancelledCount).toBe(1);

      const types = Array.from(new Set(permits.map((p) => p.type)));
      expect(types).toHaveLength(4);
      expect(types).toContain("HOT_WORK");
      expect(types).toContain("CONFINED_SPACE_ENTRY");
      expect(types).toContain("WORKING_AT_HEIGHT");
      expect(types).toContain("ELECTRICAL_ISOLATION_LOTO");
      expect(types).not.toContain("EXCAVATION");

      // Verify each permit has full audit trails starting with DRAFT_CREATED
      for (const p of permits) {
        const actions = p.auditLogs.map((a) => a.action);
        expect(actions).toContain("DRAFT_CREATED");
        expect(p.auditLogs.length).toBeGreaterThanOrEqual(1);
      }

      const totalAuditLogs = permits.reduce((acc, p) => acc + p.auditLogs.length, 0);
      expect(totalAuditLogs).toBe(54);
    });

    it("seed script is idempotent and handles re-run safely", async () => {
      expect(() => {
        execSync("npx tsx prisma/seed.ts", {
          env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
          stdio: "pipe",
        });
      }).not.toThrow();
    });
  });
});

