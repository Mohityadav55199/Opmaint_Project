/**
 * Phase 5 Operational Lifecycle Integration Tests
 *
 * Real embedded PostgreSQL instance on port 54333.
 * Real JWT tokens via loginHandler.
 * Tests work logging, confined space entry/exit, concurrency,
 * system-controlled expiry, suspension guards, closure history,
 * and transactional audit immutability.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import fs from "fs";
import EmbeddedPostgres from "embedded-postgres";
import { AUTH_COOKIE_NAME } from "../src/lib/auth";
import { prisma, resetPrismaClient } from "../src/lib/prisma";
import { POST as loginHandler } from "../src/app/api/auth/login/route";
import { POST as postPermitsHandler } from "../src/app/api/permits/route";
import { POST as submitPermitHandler } from "../src/app/api/permits/[id]/submit/route";
import { POST as approvePermitHandler } from "../src/app/api/permits/[id]/approve/route";
import { POST as activatePermitHandler } from "../src/app/api/permits/[id]/activate/route";
import { POST as suspendPermitHandler } from "../src/app/api/permits/[id]/suspend/route";
import { POST as resumePermitHandler } from "../src/app/api/permits/[id]/resume/route";
import { POST as closePermitHandler } from "../src/app/api/permits/[id]/close/route";
import { POST as verifyClosureHandler } from "../src/app/api/permits/[id]/verify-closure/route";
import { POST as cancelPermitHandler } from "../src/app/api/permits/[id]/cancel/route";
import {
  POST as postWorkLogHandler,
  GET as getWorkLogsHandler,
} from "../src/app/api/permits/[id]/work-logs/route";
import {
  POST as postEntryLogHandler,
  GET as getEntryLogsHandler,
} from "../src/app/api/permits/[id]/entry-logs/route";

const DB_PORT = 54333;
const DB_NAME = "opmaint_operational_test";
const TEST_DATABASE_URL = `postgresql://postgres:password@localhost:${DB_PORT}/${DB_NAME}?schema=public`;

// ---------- helpers ----------

async function loginAndGetToken(email: string, password = "password123"): Promise<string> {
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
  const { method = "POST", body, token } = options;
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

describe("Phase 5 Operational Lifecycle & Safety Guards (PostgreSQL)", { timeout: 180000 }, () => {
  let pgServer: EmbeddedPostgres;

  let requesterToken: string;
  let otherRequesterToken: string;
  let areaOwnerToken: string;
  let safetyOfficerToken: string;
  let adminToken: string;

  let pressEquipmentId: string;

  beforeAll(async () => {
    // 0. Kill lingering process on DB_PORT
    try {
      execSync(
        `powershell -Command "Get-NetTCPConnection -LocalPort ${DB_PORT} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`,
        { stdio: "ignore" }
      );
    } catch {}

    if (
      !fs.existsSync(".embedded-pg-operational-data/PG_VERSION") &&
      fs.existsSync(".embedded-pg-operational-data")
    ) {
      try {
        fs.rmSync(".embedded-pg-operational-data", { recursive: true, force: true });
      } catch {}
    }

    // 1. Start embedded postgres
    pgServer = new EmbeddedPostgres({
      databaseDir: ".embedded-pg-operational-data",
      port: DB_PORT,
      user: "postgres",
      password: "password",
      persistent: true,
      onLog: () => {},
      onError: () => {},
    });
    if (!fs.existsSync(".embedded-pg-operational-data/PG_VERSION")) {
      await pgServer.initialise();
    }
    await pgServer.start();

    // 2. Create database
    try {
      await pgServer.createDatabase(DB_NAME);
    } catch {}

    // 3. Set DATABASE_URL and run Prisma migrations
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    resetPrismaClient();

    execSync("npx prisma migrate deploy", {
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      stdio: "pipe",
    });

    execSync("npx tsx prisma/seed.ts", {
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      stdio: "pipe",
    });

    await prisma.$connect();

    // Create an extra requester for unauthorized test
    const bcrypt = await import("bcryptjs");
    const passwordHash = await bcrypt.hash("password123", 10);
    await prisma.user.upsert({
      where: { email: "other.requester@opmaint.local" },
      create: {
        name: "Other Requester",
        email: "other.requester@opmaint.local",
        passwordHash,
        role: "REQUESTER",
      },
      update: {},
    });

    // Resolve press equipment
    const pressEquip = await prisma.equipment.findFirstOrThrow({
      where: { area: { code: "PRESS_SHOP" } },
    });
    pressEquipmentId = pressEquip.id;

    // 5. Obtain JWT tokens
    requesterToken = await loginAndGetToken("requester@opmaint.local");
    otherRequesterToken = await loginAndGetToken("other.requester@opmaint.local");
    areaOwnerToken = await loginAndGetToken("ao.press@opmaint.local");
    safetyOfficerToken = await loginAndGetToken("safety.officer@opmaint.local");
    adminToken = await loginAndGetToken("admin@opmaint.local");
  }, 180000);

  afterAll(async () => {
    try {
      await prisma.$disconnect();
    } catch {}
    try {
      if (pgServer) await pgServer.stop();
    } catch {}
  }, 60000);

  function getValidHotWorkData() {
    return {
      hotWorkType: "WELDING",
      fireWatchName: "Vikram Rathore",
      fireExtinguisherType: "CO2 4.5kg",
      combustiblesClearedRadiusMetres: 15,
      gasTestLelPercent: 0,
      gasTestO2Percent: 20.9,
      gasTestTime: new Date().toISOString(),
      gasTesterName: "S. Swaminathan",
    };
  }

  function getValidConfinedSpaceData() {
    return {
      spaceId: "CS-TANK-01",
      entryPoint: "Manhole Top Port #2",
      standbyAttendantName: "Vipin Attendant",
      rescuePlanDescription: "Full tripod retrieval system with harness and winch line.",
      ventilationMethod: "FORCED_MECHANICAL",
      gasTestO2Percent: 20.9,
      gasTestLelPercent: 0,
      gasTestH2sPpm: 0,
      gasTestCoPpm: 0,
      gasTestTime: new Date().toISOString(),
      gasTesterName: "Technician Raj",
      communicationMethod: "Two-way radio on dedicated channel 4",
    };
  }

  function getValidHotWorkPrecautions() {
    return {
      fire_watch: true,
      combustibles_cleared: true,
      floor_covered: true,
      gas_tested: true,
      ventilation_adequate: true,
    };
  }

  function getValidConfinedSpacePrecautions() {
    return {
      isolation_verified: true,
      atmospheric_test: true,
      continuous_ventilation: true,
      standby_attendant: true,
      continuous_monitor: true,
      harness_lifeline: true,
    };
  }

  // Helper to create and advance a permit to ACTIVE
  async function createApprovedAndActivePermit(type: string, customTypeData?: Record<string, unknown>) {
    const startTime = new Date(Date.now() - 3600000); // 1 hour ago
    const endTime = new Date(Date.now() + 7 * 3600000); // 7 hours in future

    const typeData =
      customTypeData || (type === "CONFINED_SPACE_ENTRY" ? getValidConfinedSpaceData() : getValidHotWorkData());

    const precautionsChecklist =
      type === "CONFINED_SPACE_ENTRY"
        ? getValidConfinedSpacePrecautions()
        : getValidHotWorkPrecautions();

    const createReq = makeRequest("/api/permits", {
      token: requesterToken,
      body: {
        type,
        contractorTeam: "Alpha Tech Contractors",
        workDescription: "Operational testing procedure on hydraulic press unit.",
        equipmentId: pressEquipmentId,
        plannedStartTime: startTime.toISOString(),
        plannedEndTime: endTime.toISOString(),
        hazards: ["Fire and Heat Hazard", "Toxic Atmosphere"],
        ppeRequired: ["Safety Harness", "Multi-Gas Detector", "Safety Boots"],
        precautionsChecklist,
        typeData,
      },
    });
    const createRes = await postPermitsHandler(createReq);
    expect(createRes.status).toBe(201);
    const { data: created } = await createRes.json();
    const permitId = created.id;

    // Submit
    const submitReq = makeRequest(`/api/permits/${permitId}/submit`, { token: requesterToken });
    const submitRes = await submitPermitHandler(submitReq, { params: Promise.resolve({ id: permitId }) });
    expect(submitRes.status).toBe(200);

    // Approve slot 1: Area Owner
    const app1Req = makeRequest(`/api/permits/${permitId}/approve`, {
      token: areaOwnerToken,
      body: { slot: "AREA_OWNER", comment: "Area Owner Approved" },
    });
    const app1Res = await approvePermitHandler(app1Req, { params: Promise.resolve({ id: permitId }) });
    expect(app1Res.status).toBe(200);

    // Approve slot 2: Safety Officer -> Transitions to APPROVED
    const app2Req = makeRequest(`/api/permits/${permitId}/approve`, {
      token: safetyOfficerToken,
      body: { slot: "SAFETY_OFFICER", comment: "Safety Signoff Approved" },
    });
    const app2Res = await approvePermitHandler(app2Req, { params: Promise.resolve({ id: permitId }) });
    expect(app2Res.status).toBe(200);
    const { data: approved } = await app2Res.json();
    expect(approved.status).toBe("APPROVED");

    // Activate permit -> Transitions to ACTIVE
    const actReq = makeRequest(`/api/permits/${permitId}/activate`, { token: requesterToken });
    const actRes = await activatePermitHandler(actReq, { params: Promise.resolve({ id: permitId }) });
    expect(actRes.status).toBe(200);
    const { data: active } = await actRes.json();
    expect(active.status).toBe("ACTIVE");

    return permitId;
  }

  // =========================================================================
  // 1. WORK LOGGING
  // =========================================================================
  describe("1. Work Logging (ACTIVE only)", () => {
    it("accepts work log on an ACTIVE permit and writes transactional audit record", async () => {
      const permitId = await createApprovedAndActivePermit("HOT_WORK");

      const req = makeRequest(`/api/permits/${permitId}/work-logs`, {
        token: requesterToken,
        body: {
          description: "Completed initial torch setup and hot work welding on seam A-4.",
        },
      });
      const res = await postWorkLogHandler(req, { params: Promise.resolve({ id: permitId }) });
      expect(res.status).toBe(201);
      const { data: log } = await res.json();
      expect(log.id).toBeDefined();
      expect(log.description).toBe("Completed initial torch setup and hot work welding on seam A-4.");
      expect(log.author.name).toContain("Sunil Verma");

      // Verify transactional AuditLog record exists
      const audits = await prisma.auditLog.findMany({
        where: { permitId, action: "LOG_WORK" },
      });
      expect(audits.length).toBe(1);
      expect(audits[0].action).toBe("LOG_WORK");
      expect(audits[0].actorRole).toBe("REQUESTER");
      expect(audits[0].comment).toContain("Completed initial torch setup");
    });

    it("allows Safety Officer and Admin to record work logs on ACTIVE permit", async () => {
      const permitId = await createApprovedAndActivePermit("HOT_WORK");

      // Safety Officer logs inspection work
      const soReq = makeRequest(`/api/permits/${permitId}/work-logs`, {
        token: safetyOfficerToken,
        body: { description: "Conducted mid-shift site safety and ventilation inspection." },
      });
      const soRes = await postWorkLogHandler(soReq, { params: Promise.resolve({ id: permitId }) });
      expect(soRes.status).toBe(201);

      // Admin logs work
      const adminReq = makeRequest(`/api/permits/${permitId}/work-logs`, {
        token: adminToken,
        body: { description: "Administrative supervisory round completed." },
      });
      const adminRes = await postWorkLogHandler(adminReq, { params: Promise.resolve({ id: permitId }) });
      expect(adminRes.status).toBe(201);

      // GET work logs verifies both are present in chronological order
      const getReq = makeRequest(`/api/permits/${permitId}/work-logs`, {
        method: "GET",
        token: requesterToken,
      });
      const getRes = await getWorkLogsHandler(getReq, { params: Promise.resolve({ id: permitId }) });
      expect(getRes.status).toBe(200);
      const { data: logs } = await getRes.json();
      expect(logs.length).toBe(2);
      expect(logs[0].author.role).toBe("SAFETY_OFFICER");
      expect(logs[1].author.role).toBe("ADMIN");
    });

    it("rejects work logging from an unauthorized user (contractor who did not request it)", async () => {
      const permitId = await createApprovedAndActivePermit("HOT_WORK");

      const req = makeRequest(`/api/permits/${permitId}/work-logs`, {
        token: otherRequesterToken,
        body: { description: "Attempted log from non-assigned worker." },
      });
      const res = await postWorkLogHandler(req, { params: Promise.resolve({ id: permitId }) });
      expect(res.status).toBe(403);
    });

    it("rejects work log with empty or whitespace-only description (400/422)", async () => {
      const permitId = await createApprovedAndActivePermit("HOT_WORK");

      const req = makeRequest(`/api/permits/${permitId}/work-logs`, {
        token: requesterToken,
        body: { description: "   " },
      });
      const res = await postWorkLogHandler(req, { params: Promise.resolve({ id: permitId }) });
      expect(res.status).toBe(422); // Zod validation failure
    });

    it("rejects work log with future timestamp (422)", async () => {
      const permitId = await createApprovedAndActivePermit("HOT_WORK");

      const futureDate = new Date(Date.now() + 24 * 3600000);
      const req = makeRequest(`/api/permits/${permitId}/work-logs`, {
        token: requesterToken,
        body: {
          description: "Future work that hasn't happened yet.",
          performedAt: futureDate.toISOString(),
        },
      });
      const res = await postWorkLogHandler(req, { params: Promise.resolve({ id: permitId }) });
      expect(res.status).toBe(422);
    });

    it("strictly rejects work logging on DRAFT status (409)", async () => {
      const createReq = makeRequest("/api/permits", {
        token: requesterToken,
        body: {
          type: "HOT_WORK",
          contractorTeam: "Team Alpha",
          workDescription: "Hot work draft",
          equipmentId: pressEquipmentId,
          plannedStartTime: new Date().toISOString(),
          plannedEndTime: new Date(Date.now() + 4 * 3600000).toISOString(),
          hazards: ["Fire"],
          ppeRequired: ["Gloves"],
          precautionsChecklist: {},
          typeData: getValidHotWorkData(),
        },
      });
      const createRes = await postPermitsHandler(createReq);
      const { data: draft } = await createRes.json();

      const req = makeRequest(`/api/permits/${draft.id}/work-logs`, {
        token: requesterToken,
        body: { description: "Work log on draft" },
      });
      const res = await postWorkLogHandler(req, { params: Promise.resolve({ id: draft.id }) });
      expect(res.status).toBe(409);
    });

    it("strictly rejects work logging on PENDING_APPROVAL status (409)", async () => {
      const createReq = makeRequest("/api/permits", {
        token: requesterToken,
        body: {
          type: "HOT_WORK",
          contractorTeam: "Team Alpha",
          workDescription: "Hot work draft",
          equipmentId: pressEquipmentId,
          plannedStartTime: new Date().toISOString(),
          plannedEndTime: new Date(Date.now() + 4 * 3600000).toISOString(),
          hazards: ["Fire"],
          ppeRequired: ["Gloves"],
          precautionsChecklist: getValidHotWorkPrecautions(),
          typeData: getValidHotWorkData(),
        },
      });
      const createRes = await postPermitsHandler(createReq);
      const { data: draft } = await createRes.json();

      await submitPermitHandler(
        makeRequest(`/api/permits/${draft.id}/submit`, { token: requesterToken }),
        { params: Promise.resolve({ id: draft.id }) }
      );

      const req = makeRequest(`/api/permits/${draft.id}/work-logs`, {
        token: requesterToken,
        body: { description: "Work log on pending approval" },
      });
      const res = await postWorkLogHandler(req, { params: Promise.resolve({ id: draft.id }) });
      expect(res.status).toBe(409);
    });

    it("strictly rejects work logging on APPROVED status (409)", async () => {
      const startTime = new Date(Date.now() - 3600000);
      const endTime = new Date(Date.now() + 7 * 3600000);
      const createReq = makeRequest("/api/permits", {
        token: requesterToken,
        body: {
          type: "HOT_WORK",
          contractorTeam: "Team Alpha",
          workDescription: "Hot work draft",
          equipmentId: pressEquipmentId,
          plannedStartTime: startTime.toISOString(),
          plannedEndTime: endTime.toISOString(),
          hazards: ["Fire"],
          ppeRequired: ["Gloves"],
          precautionsChecklist: getValidHotWorkPrecautions(),
          typeData: getValidHotWorkData(),
        },
      });
      const createRes = await postPermitsHandler(createReq);
      const { data: draft } = await createRes.json();

      await submitPermitHandler(makeRequest(`/api/permits/${draft.id}/submit`, { token: requesterToken }), { params: Promise.resolve({ id: draft.id }) });
      await approvePermitHandler(makeRequest(`/api/permits/${draft.id}/approve`, { token: areaOwnerToken, body: { slot: "AREA_OWNER" } }), { params: Promise.resolve({ id: draft.id }) });
      const approvedRes = await approvePermitHandler(makeRequest(`/api/permits/${draft.id}/approve`, { token: safetyOfficerToken, body: { slot: "SAFETY_OFFICER" } }), { params: Promise.resolve({ id: draft.id }) });
      expect(approvedRes.status).toBe(200);

      // Attempt work log on APPROVED (before activation)
      const req = makeRequest(`/api/permits/${draft.id}/work-logs`, {
        token: requesterToken,
        body: { description: "Premature work log on approved" },
      });
      const res = await postWorkLogHandler(req, { params: Promise.resolve({ id: draft.id }) });
      expect(res.status).toBe(409);
    });

    it("strictly rejects work logging on SUSPENDED status (409)", async () => {
      const permitId = await createApprovedAndActivePermit("HOT_WORK");

      // Suspend permit
      const susReq = makeRequest(`/api/permits/${permitId}/suspend`, {
        token: safetyOfficerToken,
        body: { reason: "High winds and storm warning active." },
      });
      const susRes = await suspendPermitHandler(susReq, { params: Promise.resolve({ id: permitId }) });
      expect(susRes.status).toBe(200);

      // Attempt work log while suspended
      const req = makeRequest(`/api/permits/${permitId}/work-logs`, {
        token: requesterToken,
        body: { description: "Unauthorized work attempt during suspension." },
      });
      const res = await postWorkLogHandler(req, { params: Promise.resolve({ id: permitId }) });
      expect(res.status).toBe(409);
    });

    it("strictly rejects work logging on CANCELLED status (409)", async () => {
      const permitId = await createApprovedAndActivePermit("HOT_WORK");

      // Safety officer cancels active permit
      const cancelReq = makeRequest(`/api/permits/${permitId}/cancel`, {
        token: safetyOfficerToken,
        body: { reason: "Emergency plant shutdown ordered." },
      });
      const cancelRes = await cancelPermitHandler(cancelReq, { params: Promise.resolve({ id: permitId }) });
      expect(cancelRes.status).toBe(200);

      // Attempt work log on cancelled
      const req = makeRequest(`/api/permits/${permitId}/work-logs`, {
        token: requesterToken,
        body: { description: "Work log on cancelled permit." },
      });
      const res = await postWorkLogHandler(req, { params: Promise.resolve({ id: permitId }) });
      expect(res.status).toBe(409);
    });

    it("strictly rejects work logging on CLOSED and CLOSED_VERIFIED status (409)", async () => {
      const permitId = await createApprovedAndActivePermit("HOT_WORK");

      // Log valid work while ACTIVE
      await postWorkLogHandler(
        makeRequest(`/api/permits/${permitId}/work-logs`, {
          token: requesterToken,
          body: { description: "Hot work completed safely." },
        }),
        { params: Promise.resolve({ id: permitId }) }
      );

      // Close permit
      const closeReq = makeRequest(`/api/permits/${permitId}/close`, {
        token: requesterToken,
        body: { workCompletionNotes: "Work done, site cleaned up, tools packed." },
      });
      const closeRes = await closePermitHandler(closeReq, { params: Promise.resolve({ id: permitId }) });
      expect(closeRes.status).toBe(200);

      // Work log on CLOSED rejected
      const reqClosed = makeRequest(`/api/permits/${permitId}/work-logs`, {
        token: requesterToken,
        body: { description: "Attempted work log after closure." },
      });
      const resClosed = await postWorkLogHandler(reqClosed, { params: Promise.resolve({ id: permitId }) });
      expect(resClosed.status).toBe(409);

      // Verify closure
      const verifyReq = makeRequest(`/api/permits/${permitId}/verify-closure`, {
        token: safetyOfficerToken,
        body: { closureVerifiedNotes: "Site housekeeping inspected and approved." },
      });
      const verifyRes = await verifyClosureHandler(verifyReq, { params: Promise.resolve({ id: permitId }) });
      expect(verifyRes.status).toBe(200);

      // Work log on CLOSED_VERIFIED rejected
      const reqVerified = makeRequest(`/api/permits/${permitId}/work-logs`, {
        token: requesterToken,
        body: { description: "Attempted work log after closure verification." },
      });
      const resVerified = await postWorkLogHandler(reqVerified, { params: Promise.resolve({ id: permitId }) });
      expect(resVerified.status).toBe(409);
    });
  });

  // =========================================================================
  // 2. CONFINED SPACE ENTRY / EXIT
  // =========================================================================
  describe("2. Confined Space Entry / Exit Logging", () => {
    it("rejects entry/exit logging for non-confined-space permit types (422)", async () => {
      const hotWorkPermitId = await createApprovedAndActivePermit("HOT_WORK");

      const req = makeRequest(`/api/permits/${hotWorkPermitId}/entry-logs`, {
        token: requesterToken,
        body: { direction: "ENTRY", personName: "Sanjay Kumar" },
      });
      const res = await postEntryLogHandler(req, { params: Promise.resolve({ id: hotWorkPermitId }) });
      expect(res.status).toBe(422);
    });

    it("accepts valid ENTRY and EXIT sequence on ACTIVE CONFINED_SPACE_ENTRY permit and calculates live roster", async () => {
      const csPermitId = await createApprovedAndActivePermit("CONFINED_SPACE_ENTRY");

      const t0 = new Date(Date.now() - 60000);
      const t1 = new Date(Date.now() - 30000);

      // 1. Worker 1 enters
      const e1Req = makeRequest(`/api/permits/${csPermitId}/entry-logs`, {
        token: requesterToken,
        body: { direction: "ENTRY", personName: "Sanjay Kumar", at: t0.toISOString() },
      });
      const e1Res = await postEntryLogHandler(e1Req, { params: Promise.resolve({ id: csPermitId }) });
      expect(e1Res.status).toBe(201);

      // 2. Worker 2 enters
      const e2Req = makeRequest(`/api/permits/${csPermitId}/entry-logs`, {
        token: safetyOfficerToken,
        body: { direction: "ENTRY", personName: "Manoj Verma", at: t0.toISOString() },
      });
      const e2Res = await postEntryLogHandler(e2Req, { params: Promise.resolve({ id: csPermitId }) });
      expect(e2Res.status).toBe(201);

      // Check live roster: headcount should be 2
      const roster1Req = makeRequest(`/api/permits/${csPermitId}/entry-logs`, { method: "GET", token: requesterToken });
      const roster1Res = await getEntryLogsHandler(roster1Req, { params: Promise.resolve({ id: csPermitId }) });
      expect(roster1Res.status).toBe(200);
      const { data: r1 } = await roster1Res.json();
      expect(r1.headcount).toBe(2);
      expect(r1.currentlyInside).toContain("Sanjay Kumar");
      expect(r1.currentlyInside).toContain("Manoj Verma");

      // 3. Worker 1 exits
      const ex1Req = makeRequest(`/api/permits/${csPermitId}/entry-logs`, {
        token: requesterToken,
        body: { direction: "EXIT", personName: "Sanjay Kumar", at: t1.toISOString() },
      });
      const ex1Res = await postEntryLogHandler(ex1Req, { params: Promise.resolve({ id: csPermitId }) });
      expect(ex1Res.status).toBe(201);

      // Check live roster: headcount should now be 1 (Manoj Verma still inside)
      const roster2Req = makeRequest(`/api/permits/${csPermitId}/entry-logs`, { method: "GET", token: requesterToken });
      const roster2Res = await getEntryLogsHandler(roster2Req, { params: Promise.resolve({ id: csPermitId }) });
      expect(roster2Res.status).toBe(200);
      const { data: r2 } = await roster2Res.json();
      expect(r2.headcount).toBe(1);
      expect(r2.currentlyInside).toEqual(["Manoj Verma"]);

      // 4. Verify transactional AuditLog records exist
      const audits = await prisma.auditLog.findMany({
        where: { permitId: csPermitId, action: "LOG_ENTRY_EXIT" },
      });
      expect(audits.length).toBe(3);
    });

    it("rejects duplicate ENTRY for person already inside (422)", async () => {
      const csPermitId = await createApprovedAndActivePermit("CONFINED_SPACE_ENTRY");

      // Entry 1
      const e1Req = makeRequest(`/api/permits/${csPermitId}/entry-logs`, {
        token: requesterToken,
        body: { direction: "ENTRY", personName: "Deepak Saini" },
      });
      const e1Res = await postEntryLogHandler(e1Req, { params: Promise.resolve({ id: csPermitId }) });
      expect(e1Res.status).toBe(201);

      // Duplicate entry without exiting
      const e2Req = makeRequest(`/api/permits/${csPermitId}/entry-logs`, {
        token: requesterToken,
        body: { direction: "ENTRY", personName: "Deepak Saini" },
      });
      const e2Res = await postEntryLogHandler(e2Req, { params: Promise.resolve({ id: csPermitId }) });
      expect(e2Res.status).toBe(422);
      const err = await e2Res.json();
      expect(err.message).toContain("already recorded as inside");
    });

    it("rejects EXIT for a person who is not recorded inside (422)", async () => {
      const csPermitId = await createApprovedAndActivePermit("CONFINED_SPACE_ENTRY");

      // Attempt exit without prior entry
      const exitReq = makeRequest(`/api/permits/${csPermitId}/entry-logs`, {
        token: requesterToken,
        body: { direction: "EXIT", personName: "Never Entered Person" },
      });
      const exitRes = await postEntryLogHandler(exitReq, { params: Promise.resolve({ id: csPermitId }) });
      expect(exitRes.status).toBe(422);
      const err = await exitRes.json();
      expect(err.message).toContain("not recorded as inside");
    });

    it("rejects EXIT with timestamp earlier than ENTRY timestamp (422)", async () => {
      const csPermitId = await createApprovedAndActivePermit("CONFINED_SPACE_ENTRY");

      const entryTime = new Date(Date.now() - 60000);
      const earlierExitTime = new Date(Date.now() - 120000);

      // Record valid ENTRY
      await postEntryLogHandler(
        makeRequest(`/api/permits/${csPermitId}/entry-logs`, {
          token: requesterToken,
          body: { direction: "ENTRY", personName: "Pooja Hegde", at: entryTime.toISOString() },
        }),
        { params: Promise.resolve({ id: csPermitId }) }
      );

      // Attempt EXIT before ENTRY
      const exitReq = makeRequest(`/api/permits/${csPermitId}/entry-logs`, {
        token: requesterToken,
        body: { direction: "EXIT", personName: "Pooja Hegde", at: earlierExitTime.toISOString() },
      });
      const exitRes = await postEntryLogHandler(exitReq, { params: Promise.resolve({ id: csPermitId }) });
      expect(exitRes.status).toBe(422);
      const err = await exitRes.json();
      expect(err.message).toContain("cannot precede corresponding entry timestamp");
    });

    it("prevents race conditions on concurrent duplicate ENTRY via row lock (PostgreSQL concurrency)", async () => {
      const csPermitId = await createApprovedAndActivePermit("CONFINED_SPACE_ENTRY");

      // Fire 2 concurrent ENTRY requests simultaneously for the exact same person
      const req1 = makeRequest(`/api/permits/${csPermitId}/entry-logs`, {
        token: requesterToken,
        body: { direction: "ENTRY", personName: "Simultaneous Person" },
      });
      const req2 = makeRequest(`/api/permits/${csPermitId}/entry-logs`, {
        token: safetyOfficerToken,
        body: { direction: "ENTRY", personName: "Simultaneous Person" },
      });

      const [res1, res2] = await Promise.all([
        postEntryLogHandler(req1, { params: Promise.resolve({ id: csPermitId }) }),
        postEntryLogHandler(req2, { params: Promise.resolve({ id: csPermitId }) }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      // Because the permit row was locked FOR UPDATE before querying latest state:
      // Exactly ONE request must succeed (201) and the other MUST fail with 422
      expect(statuses).toEqual([201, 422]);

      // Exactly 1 EntryExitLog record should exist for this person
      const logs = await prisma.entryExitLog.findMany({
        where: { permitId: csPermitId, personName: "Simultaneous Person" },
      });
      expect(logs.length).toBe(1);
    });
  });

  // =========================================================================
  // 3. EXPIRY
  // =========================================================================
  describe("3. System Expiry & Operational Guards", () => {
    it("cannot activate an expired permit (422) and automatically transitions it to EXPIRED with system audit log", async () => {
      // Create permit that has already lapsed in time
      const startTime = new Date(Date.now() - 7200000); // 2 hours ago
      const endTime = new Date(Date.now() - 1800000);   // 30 mins ago (EXPIRED)

      const createReq = makeRequest("/api/permits", {
        token: requesterToken,
        body: {
          type: "HOT_WORK",
          contractorTeam: "Lapsed Contractors",
          workDescription: "Lapsed permit test",
          equipmentId: pressEquipmentId,
          plannedStartTime: startTime.toISOString(),
          plannedEndTime: endTime.toISOString(),
          hazards: ["Fire"],
          ppeRequired: ["Gloves"],
          precautionsChecklist: getValidHotWorkPrecautions(),
          typeData: getValidHotWorkData(),
        },
      });
      const createRes = await postPermitsHandler(createReq);
      expect(createRes.status).toBe(201);
      const { data: created } = await createRes.json();
      const permitId = created.id;

      // Force status to APPROVED in DB to test activate guard on expired permit
      await prisma.permit.update({
        where: { id: permitId },
        data: { status: "APPROVED" },
      });

      // Attempt to activate expired permit
      const actReq = makeRequest(`/api/permits/${permitId}/activate`, { token: requesterToken });
      const actRes = await activatePermitHandler(actReq, { params: Promise.resolve({ id: permitId }) });
      expect([409, 422]).toContain(actRes.status);

      // Verify DB status was transitioned to EXPIRED
      const updated = await prisma.permit.findUnique({ where: { id: permitId } });
      expect(updated?.status).toBe("EXPIRED");

      // Verify transactional system audit log was created
      const audit = await prisma.auditLog.findFirst({
        where: { permitId, action: "EXPIRE" },
      });
      expect(audit).not.toBeNull();
      expect(audit?.actorLabel).toBe("SYSTEM");
      expect(audit?.actorRole).toBe("SYSTEM");
      expect(audit?.actorId).toBeNull();
    });

    it("cannot resume a suspended permit whose validity has expired (422)", async () => {
      const permitId = await createApprovedAndActivePermit("HOT_WORK");

      // Suspend permit
      await suspendPermitHandler(
        makeRequest(`/api/permits/${permitId}/suspend`, {
          token: safetyOfficerToken,
          body: { reason: "Temporary suspension" },
        }),
        { params: Promise.resolve({ id: permitId }) }
      );

      // Fast-forward expiresAt to the past in DB (setting plannedEndTime <= expiresAt for DB constraint)
      const expiredTime = new Date(Date.now() - 60000);
      await prisma.permit.update({
        where: { id: permitId },
        data: {
          plannedEndTime: expiredTime,
          expiresAt: expiredTime,
        },
      });

      // Attempt to resume
      const resumeReq = makeRequest(`/api/permits/${permitId}/resume`, { token: safetyOfficerToken });
      const resumeRes = await resumePermitHandler(resumeReq, { params: Promise.resolve({ id: permitId }) });
      expect([409, 422]).toContain(resumeRes.status);

      // Verify DB status transitioned to EXPIRED
      const updated = await prisma.permit.findUnique({ where: { id: permitId } });
      expect(updated?.status).toBe("EXPIRED");
    });

    it("cannot log work against an expired permit (409/422)", async () => {
      const permitId = await createApprovedAndActivePermit("HOT_WORK");

      // Fast-forward expiresAt to the past (setting plannedEndTime <= expiresAt for DB constraint)
      const expiredTime = new Date(Date.now() - 60000);
      await prisma.permit.update({
        where: { id: permitId },
        data: {
          plannedEndTime: expiredTime,
          expiresAt: expiredTime,
        },
      });

      const req = makeRequest(`/api/permits/${permitId}/work-logs`, {
        token: requesterToken,
        body: { description: "Attempted work log on expired permit" },
      });
      const res = await postWorkLogHandler(req, { params: Promise.resolve({ id: permitId }) });
      expect([409, 422]).toContain(res.status);

      // Verify status is now EXPIRED
      const updated = await prisma.permit.findUnique({ where: { id: permitId } });
      expect(updated?.status).toBe("EXPIRED");
    });
  });

  // =========================================================================
  // 4. SUSPENSION + WORK CYCLE
  // =========================================================================
  describe("4. Suspension & Resume Lifecycle with Work Logging", () => {
    it("permits work when ACTIVE, forbids work when SUSPENDED, permits work again when RESUMED", async () => {
      const permitId = await createApprovedAndActivePermit("HOT_WORK");

      // 1. ACTIVE: Work logging permitted
      const w1Res = await postWorkLogHandler(
        makeRequest(`/api/permits/${permitId}/work-logs`, {
          token: requesterToken,
          body: { description: "Initial grinding phase completed." },
        }),
        { params: Promise.resolve({ id: permitId }) }
      );
      expect(w1Res.status).toBe(201);

      // 2. Suspend permit
      const susRes = await suspendPermitHandler(
        makeRequest(`/api/permits/${permitId}/suspend`, {
          token: safetyOfficerToken,
          body: { reason: "Smoke detector malfunction in adjacent bay." },
        }),
        { params: Promise.resolve({ id: permitId }) }
      );
      expect(susRes.status).toBe(200);

      // 3. SUSPENDED: Work logging forbidden
      const w2Res = await postWorkLogHandler(
        makeRequest(`/api/permits/${permitId}/work-logs`, {
          token: requesterToken,
          body: { description: "Attempted work log during suspension." },
        }),
        { params: Promise.resolve({ id: permitId }) }
      );
      expect(w2Res.status).toBe(409);

      // 4. Resume permit
      const resRes = await resumePermitHandler(
        makeRequest(`/api/permits/${permitId}/resume`, { token: safetyOfficerToken }),
        { params: Promise.resolve({ id: permitId }) }
      );
      expect(resRes.status).toBe(200);

      // 5. RESUMED ACTIVE: Work logging permitted again
      const w3Res = await postWorkLogHandler(
        makeRequest(`/api/permits/${permitId}/work-logs`, {
          token: requesterToken,
          body: { description: "Resumed work after smoke detector cleared." },
        }),
        { params: Promise.resolve({ id: permitId }) }
      );
      expect(w3Res.status).toBe(201);

      // Verify all 2 valid work logs are saved
      const listRes = await getWorkLogsHandler(
        makeRequest(`/api/permits/${permitId}/work-logs`, { method: "GET", token: requesterToken }),
        { params: Promise.resolve({ id: permitId }) }
      );
      const { data: logs } = await listRes.json();
      expect(logs.length).toBe(2);
      expect(logs[0].description).toContain("Initial grinding");
      expect(logs[1].description).toContain("Resumed work");
    });
  });

  // =========================================================================
  // 5. AUDIT IMMUTABILITY
  // =========================================================================
  describe("5. PostgreSQL Audit Immutability", () => {
    it("PostgreSQL trigger strictly rejects direct UPDATE or DELETE on AuditLog table", async () => {
      const permitId = await createApprovedAndActivePermit("HOT_WORK");

      const audit = await prisma.auditLog.findFirst({
        where: { permitId },
      });
      expect(audit).not.toBeNull();

      // Attempt UPDATE
      await expect(
        prisma.$executeRaw`UPDATE "AuditLog" SET "comment" = 'Tampered' WHERE id = ${audit?.id}`
      ).rejects.toThrow();

      // Attempt DELETE
      await expect(
        prisma.$executeRaw`DELETE FROM "AuditLog" WHERE id = ${audit?.id}`
      ).rejects.toThrow();
    });
  });
});
