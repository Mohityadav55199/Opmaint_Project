/**
 * Phase 4 Workflow & State Machine Integration Tests
 *
 * Dedicated embedded PostgreSQL instance on port 54332.
 * Real JWT tokens via loginHandler.
 * Direct handler invocation with real PostgreSQL database.
 * Tests concurrent approvals, RBAC, Area Owner equipment scoping,
 * zero self-approval, full state machine lifecycle, and audit immutability.
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
import { POST as rejectPermitHandler } from "../src/app/api/permits/[id]/reject/route";
import { POST as activatePermitHandler } from "../src/app/api/permits/[id]/activate/route";
import { POST as suspendPermitHandler } from "../src/app/api/permits/[id]/suspend/route";
import { POST as resumePermitHandler } from "../src/app/api/permits/[id]/resume/route";
import { POST as closePermitHandler } from "../src/app/api/permits/[id]/close/route";
import { POST as verifyClosureHandler } from "../src/app/api/permits/[id]/verify-closure/route";
import { POST as cancelPermitHandler } from "../src/app/api/permits/[id]/cancel/route";

const DB_PORT = 54332;
const DB_NAME = "opmaint_workflow_test";
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

describe("Phase 4 Workflow & State Machine Integration (PostgreSQL)", { timeout: 180000 }, () => {
  let pgServer: EmbeddedPostgres;

  let requesterToken: string;
  let pressAreaOwnerToken: string;
  let paintAreaOwnerToken: string;
  let safetyOfficerToken: string;
  let adminToken: string;

  let pressEquipmentId: string;
  let paintEquipmentId: string;

  beforeAll(async () => {
    // 0. Kill lingering process on DB_PORT
    try {
      execSync(
        `powershell -Command "Get-NetTCPConnection -LocalPort ${DB_PORT} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`,
        { stdio: "ignore" }
      );
    } catch {}

    if (
      !fs.existsSync(".embedded-pg-workflow-data/PG_VERSION") &&
      fs.existsSync(".embedded-pg-workflow-data")
    ) {
      try {
        fs.rmSync(".embedded-pg-workflow-data", { recursive: true, force: true });
      } catch {}
    }

    pgServer = new EmbeddedPostgres({
      port: DB_PORT,
      databaseDir: ".embedded-pg-workflow-data",
      user: "postgres",
      password: "password",
      persistent: true,
      onLog: () => {},
      onError: () => {},
    });

    if (!fs.existsSync(".embedded-pg-workflow-data/PG_VERSION")) {
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
      stdio: "pipe",
    });

    execSync("npx tsx prisma/seed.ts", {
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      stdio: "pipe",
    });

    await prisma.$connect();

    // Resolve press equipment and paint equipment
    const pressEquip = await prisma.equipment.findFirstOrThrow({
      where: { area: { code: "PRESS_SHOP" } },
    });
    pressEquipmentId = pressEquip.id;

    const paintEquip = await prisma.equipment.findFirstOrThrow({
      where: { area: { code: "PAINT_SHOP" } },
    });
    paintEquipmentId = paintEquip.id;

    // Authenticate all test roles
    requesterToken = await loginAndGetToken("requester@opmaint.local");
    pressAreaOwnerToken = await loginAndGetToken("ao.press@opmaint.local");
    paintAreaOwnerToken = await loginAndGetToken("ao.paint@opmaint.local");
    safetyOfficerToken = await loginAndGetToken("safety.officer@opmaint.local");
    adminToken = await loginAndGetToken("admin@opmaint.local");
  }, 180000);

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (pgServer) {
      try {
        await pgServer.stop();
      } catch {}
    }
  }, 30000);

  function getValidHotWorkBody(options?: {
    equipmentId?: string;
    plannedStartTime?: Date;
    plannedEndTime?: Date;
  }) {
    const now = new Date();
    const start = options?.plannedStartTime ?? new Date(now.getTime() + 1000 * 60 * 60); // 1h in future
    const end = options?.plannedEndTime ?? new Date(start.getTime() + 1000 * 60 * 60 * 4); // 4h duration

    return {
      type: "HOT_WORK",
      equipmentId: options?.equipmentId ?? pressEquipmentId,
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
  }

  // Helper to create and submit a draft permit on press equipment
  async function createAndSubmitPermit(options?: {
    equipmentId?: string;
    plannedStartTime?: Date;
    plannedEndTime?: Date;
  }): Promise<string> {
    const body = getValidHotWorkBody(options);

    const createReq = makeRequest("/api/permits", {
      method: "POST",
      token: requesterToken,
      body,
    });
    const createRes = await postPermitsHandler(createReq);
    expect(createRes.status).toBe(201);
    const { data: created } = await createRes.json();

    const submitReq = makeRequest(`/api/permits/${created.id}/submit`, {
      method: "POST",
      token: requesterToken,
    });
    const submitRes = await submitPermitHandler(submitReq, { params: Promise.resolve({ id: created.id }) });
    expect(submitRes.status).toBe(200);
    const { data: submitted } = await submitRes.json();
    expect(submitted.status).toBe("PENDING_APPROVAL");

    return created.id;
  }

  // -------------------------------------------------------------
  // 1. Approval Roles, Scopes, and Zero Self-Approval
  // -------------------------------------------------------------
  describe("Approval Roles & Scopes", () => {
    it("rejects approval attempt without authentication (401)", async () => {
      const permitId = await createAndSubmitPermit();
      const req = makeRequest(`/api/permits/${permitId}/approve`, { method: "POST" });
      const res = await approvePermitHandler(req, { params: Promise.resolve({ id: permitId }) });
      expect(res.status).toBe(401);
    });

    it("strictly blocks requester from approving any permit (403)", async () => {
      const permitId = await createAndSubmitPermit();
      const req = makeRequest(`/api/permits/${permitId}/approve`, {
        method: "POST",
        token: requesterToken,
      });
      const res = await approvePermitHandler(req, { params: Promise.resolve({ id: permitId }) });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.message).toMatch(/requester|self-approval/i);
    });

    it("strictly blocks Area Owner from approving equipment outside their assigned area (403)", async () => {
      // Permit is on press equipment. Paint Area Owner attempts approval.
      const permitId = await createAndSubmitPermit({ equipmentId: pressEquipmentId });
      const req = makeRequest(`/api/permits/${permitId}/approve`, {
        method: "POST",
        token: paintAreaOwnerToken,
        body: { slot: "AREA_OWNER" },
      });
      const res = await approvePermitHandler(req, { params: Promise.resolve({ id: permitId }) });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.message).toMatch(/area/i);
    });

    it("allows designated Area Owner to approve for equipment in their area (200)", async () => {
      const permitId = await createAndSubmitPermit({ equipmentId: pressEquipmentId });
      const req = makeRequest(`/api/permits/${permitId}/approve`, {
        method: "POST",
        token: pressAreaOwnerToken,
        body: { slot: "AREA_OWNER", comment: "Press area approved by Vikram" },
      });
      const res = await approvePermitHandler(req, { params: Promise.resolve({ id: permitId }) });
      expect(res.status).toBe(200);
      const { data } = await res.json();
      // Partial approval: still PENDING_APPROVAL because SAFETY_OFFICER has not approved
      expect(data.status).toBe("PENDING_APPROVAL");
      expect(data.approvals).toHaveLength(1);
      expect(data.approvals[0].slot).toBe("AREA_OWNER");
      expect(data.approvals[0].decision).toBe("APPROVED");

      // Verify paint area owner can approve permit on paint equipment
      const paintPermitId = await createAndSubmitPermit({ equipmentId: paintEquipmentId });
      const paintReq = makeRequest(`/api/permits/${paintPermitId}/approve`, {
        method: "POST",
        token: paintAreaOwnerToken,
        body: { slot: "AREA_OWNER", comment: "Paint area approved by Pooja" },
      });
      const paintRes = await approvePermitHandler(paintReq, { params: Promise.resolve({ id: paintPermitId }) });
      expect(paintRes.status).toBe(200);
    });

    it("allows Safety Officer to approve their slot (200)", async () => {
      const permitId = await createAndSubmitPermit({ equipmentId: pressEquipmentId });
      const req = makeRequest(`/api/permits/${permitId}/approve`, {
        method: "POST",
        token: safetyOfficerToken,
        body: { slot: "SAFETY_OFFICER", comment: "Safety measures verified" },
      });
      const res = await approvePermitHandler(req, { params: Promise.resolve({ id: permitId }) });
      expect(res.status).toBe(200);
      const { data } = await res.json();
      // Partial approval: still PENDING_APPROVAL because AREA_OWNER has not approved
      expect(data.status).toBe("PENDING_APPROVAL");
      expect(data.approvals).toHaveLength(1);
      expect(data.approvals[0].slot).toBe("SAFETY_OFFICER");
    });

    it("blocks duplicate approval for an already filled slot in the same round (403 or 409)", async () => {
      const permitId = await createAndSubmitPermit();
      // 1. Safety officer approves slot SAFETY_OFFICER
      const req1 = makeRequest(`/api/permits/${permitId}/approve`, {
        method: "POST",
        token: safetyOfficerToken,
        body: { slot: "SAFETY_OFFICER" },
      });
      const res1 = await approvePermitHandler(req1, { params: Promise.resolve({ id: permitId }) });
      expect(res1.status).toBe(200);

      // 2. Safety officer attempts to approve SAFETY_OFFICER again
      const req2 = makeRequest(`/api/permits/${permitId}/approve`, {
        method: "POST",
        token: safetyOfficerToken,
        body: { slot: "SAFETY_OFFICER" },
      });
      const res2 = await approvePermitHandler(req2, { params: Promise.resolve({ id: permitId }) });
      expect([403, 409]).toContain(res2.status);
    });

    it("blocks one user from filling both required slots in the same round (403)", async () => {
      const permitId = await createAndSubmitPermit();
      // Area Owner approves as AREA_OWNER
      const req1 = makeRequest(`/api/permits/${permitId}/approve`, {
        method: "POST",
        token: pressAreaOwnerToken,
        body: { slot: "AREA_OWNER" },
      });
      const res1 = await approvePermitHandler(req1, { params: Promise.resolve({ id: permitId }) });
      expect(res1.status).toBe(200);

      // Same Area Owner attempts to also approve as SAFETY_OFFICER
      const req2 = makeRequest(`/api/permits/${permitId}/approve`, {
        method: "POST",
        token: pressAreaOwnerToken,
        body: { slot: "SAFETY_OFFICER" },
      });
      const res2 = await approvePermitHandler(req2, { params: Promise.resolve({ id: permitId }) });
      expect([403, 409]).toContain(res2.status);
    });
  });

  // -------------------------------------------------------------
  // 2. Sequential & Complete Approval Workflow
  // -------------------------------------------------------------
  describe("Approval Completion & Transition to APPROVED", () => {
    it("transitions permit to APPROVED only when BOTH required slots are approved", async () => {
      const permitId = await createAndSubmitPermit({ equipmentId: pressEquipmentId });

      // Step 1: Area Owner approves
      const req1 = makeRequest(`/api/permits/${permitId}/approve`, {
        method: "POST",
        token: pressAreaOwnerToken,
        body: { slot: "AREA_OWNER" },
      });
      const res1 = await approvePermitHandler(req1, { params: Promise.resolve({ id: permitId }) });
      expect(res1.status).toBe(200);
      const { data: step1 } = await res1.json();
      expect(step1.status).toBe("PENDING_APPROVAL"); // NOT APPROVED yet

      // Step 2: Safety Officer approves
      const req2 = makeRequest(`/api/permits/${permitId}/approve`, {
        method: "POST",
        token: safetyOfficerToken,
        body: { slot: "SAFETY_OFFICER" },
      });
      const res2 = await approvePermitHandler(req2, { params: Promise.resolve({ id: permitId }) });
      expect(res2.status).toBe(200);
      const { data: step2 } = await res2.json();
      expect(step2.status).toBe("APPROVED"); // Now fully APPROVED!
      expect(step2.approvals).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------
  // 3. Concurrency Safety: Simultaneous Approvals
  // -------------------------------------------------------------
  describe("Concurrency Safety (PostgreSQL Transaction & Row Lock)", () => {
    it("handles simultaneous approvals by Area Owner and Safety Officer cleanly via Promise.all", async () => {
      const permitId = await createAndSubmitPermit({ equipmentId: pressEquipmentId });

      // Launch both approvals concurrently against the real PostgreSQL database
      const [resAO, resSO] = await Promise.all([
        approvePermitHandler(
          makeRequest(`/api/permits/${permitId}/approve`, {
            method: "POST",
            token: pressAreaOwnerToken,
            body: { slot: "AREA_OWNER", comment: "Concurrent AO" },
          }),
          { params: Promise.resolve({ id: permitId }) }
        ),
        approvePermitHandler(
          makeRequest(`/api/permits/${permitId}/approve`, {
            method: "POST",
            token: safetyOfficerToken,
            body: { slot: "SAFETY_OFFICER", comment: "Concurrent SO" },
          }),
          { params: Promise.resolve({ id: permitId }) }
        ),
      ]);

      expect(resAO.status).toBe(200);
      expect(resSO.status).toBe(200);

      // Verify final permit in database
      const finalPermit = await prisma.permit.findUniqueOrThrow({
        where: { id: permitId },
        include: { approvals: true, auditLogs: true },
      });

      expect(finalPermit.status).toBe("APPROVED");
      expect(finalPermit.approvals).toHaveLength(2);

      const slots = finalPermit.approvals.map((a) => a.slot).sort();
      expect(slots).toEqual(["AREA_OWNER", "SAFETY_OFFICER"]);

      // Verify audit logs exist for both approvals
      const approveAudits = finalPermit.auditLogs.filter((l) => l.action === "APPROVE");
      expect(approveAudits).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------
  // 4. Rejection Semantics
  // -------------------------------------------------------------
  describe("Rejection Semantics", () => {
    it("rejects rejection attempt without mandatory reason (422)", async () => {
      const permitId = await createAndSubmitPermit({ equipmentId: pressEquipmentId });
      const req = makeRequest(`/api/permits/${permitId}/reject`, {
        method: "POST",
        token: pressAreaOwnerToken,
        body: { reason: "   " }, // empty
      });
      const res = await rejectPermitHandler(req, { params: Promise.resolve({ id: permitId }) });
      expect(res.status).toBe(422);
    });

    it("blocks requester from rejecting their own permit (403)", async () => {
      const permitId = await createAndSubmitPermit();
      const req = makeRequest(`/api/permits/${permitId}/reject`, {
        method: "POST",
        token: requesterToken,
        body: { reason: "Trying to reject my own permit" },
      });
      const res = await rejectPermitHandler(req, { params: Promise.resolve({ id: permitId }) });
      expect(res.status).toBe(403);
    });

    it("allows eligible Area Owner to reject with valid reason (200 → REJECTED)", async () => {
      const permitId = await createAndSubmitPermit({ equipmentId: pressEquipmentId });
      const req = makeRequest(`/api/permits/${permitId}/reject`, {
        method: "POST",
        token: pressAreaOwnerToken,
        body: { reason: "Fire extinguisher tag is missing inspection certification." },
      });
      const res = await rejectPermitHandler(req, { params: Promise.resolve({ id: permitId }) });
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data.status).toBe("REJECTED");
      expect(data.rejectionReason).toMatch(/fire extinguisher/i);

      // Verify audit record was created
      const audit = await prisma.auditLog.findFirst({
        where: { permitId, action: "REJECT" },
      });
      expect(audit).not.toBeNull();
      expect(audit?.fromValue).toBe("PENDING_APPROVAL");
      expect(audit?.toValue).toBe("REJECTED");
    });

    it("blocks further approvals once a permit is REJECTED (409)", async () => {
      const permitId = await createAndSubmitPermit({ equipmentId: pressEquipmentId });

      // Reject it
      await rejectPermitHandler(
        makeRequest(`/api/permits/${permitId}/reject`, {
          method: "POST",
          token: safetyOfficerToken,
          body: { reason: "Unsafe environmental conditions" },
        }),
        { params: Promise.resolve({ id: permitId }) }
      );

      // Now Area Owner tries to approve
      const req = makeRequest(`/api/permits/${permitId}/approve`, {
        method: "POST",
        token: pressAreaOwnerToken,
      });
      const res = await approvePermitHandler(req, { params: Promise.resolve({ id: permitId }) });
      expect(res.status).toBe(409);
    });
  });

  // -------------------------------------------------------------
  // 5. Activation Lifecycle (APPROVED → ACTIVE)
  // -------------------------------------------------------------
  describe("Permit Activation", () => {
    async function createApprovedPermit(offsetMinutes = -5): Promise<string> {
      // Planned start time set to offsetMinutes relative to now (e.g. 5 minutes ago so it can be activated immediately)
      const now = new Date();
      const start = new Date(now.getTime() + offsetMinutes * 60 * 1000);
      const end = new Date(start.getTime() + 1000 * 60 * 60 * 4);

      const permitId = await createAndSubmitPermit({
        equipmentId: pressEquipmentId,
        plannedStartTime: start,
        plannedEndTime: end,
      });

      // Approve both slots
      await approvePermitHandler(
        makeRequest(`/api/permits/${permitId}/approve`, {
          method: "POST",
          token: pressAreaOwnerToken,
          body: { slot: "AREA_OWNER" },
        }),
        { params: Promise.resolve({ id: permitId }) }
      );
      await approvePermitHandler(
        makeRequest(`/api/permits/${permitId}/approve`, {
          method: "POST",
          token: safetyOfficerToken,
          body: { slot: "SAFETY_OFFICER" },
        }),
        { params: Promise.resolve({ id: permitId }) }
      );

      return permitId;
    }

    it("blocks activation before permit is APPROVED (409)", async () => {
      // Only submitted (PENDING_APPROVAL)
      const permitId = await createAndSubmitPermit();
      const req = makeRequest(`/api/permits/${permitId}/activate`, {
        method: "POST",
        token: requesterToken,
      });
      const res = await activatePermitHandler(req, { params: Promise.resolve({ id: permitId }) });
      expect(res.status).toBe(409);
    });

    it("blocks activation if planned start time is in the future (422)", async () => {
      // Planned start 1 hour in the future
      const permitId = await createApprovedPermit(60);
      const req = makeRequest(`/api/permits/${permitId}/activate`, {
        method: "POST",
        token: requesterToken,
      });
      const res = await activatePermitHandler(req, { params: Promise.resolve({ id: permitId }) });
      expect(res.status).toBe(422);
      const data = await res.json();
      expect(data.message).toMatch(/cannot be activated before its planned start time/i);
    });

    it("allows requester to activate approved permit when work commences (200 → ACTIVE)", async () => {
      const permitId = await createApprovedPermit(-5);
      const req = makeRequest(`/api/permits/${permitId}/activate`, {
        method: "POST",
        token: requesterToken,
      });
      const res = await activatePermitHandler(req, { params: Promise.resolve({ id: permitId }) });
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data.status).toBe("ACTIVE");
      expect(data.actualStartTime).not.toBeNull();
      expect(data.activatedById).not.toBeNull();

      // Verify audit log
      const audit = await prisma.auditLog.findFirst({
        where: { permitId, action: "ACTIVATE" },
      });
      expect(audit).not.toBeNull();
      expect(audit?.fromValue).toBe("APPROVED");
      expect(audit?.toValue).toBe("ACTIVE");
    });
  });

  // -------------------------------------------------------------
  // 6. Suspension and Resumption (ACTIVE ↔ SUSPENDED)
  // -------------------------------------------------------------
  describe("Suspension & Resumption", () => {
    async function createActivePermit(): Promise<string> {
      const now = new Date();
      const start = new Date(now.getTime() - 1000 * 60 * 10);
      const end = new Date(start.getTime() + 1000 * 60 * 60 * 4);

      const permitId = await createAndSubmitPermit({
        equipmentId: pressEquipmentId,
        plannedStartTime: start,
        plannedEndTime: end,
      });

      await approvePermitHandler(
        makeRequest(`/api/permits/${permitId}/approve`, {
          method: "POST",
          token: pressAreaOwnerToken,
          body: { slot: "AREA_OWNER" },
        }),
        { params: Promise.resolve({ id: permitId }) }
      );
      await approvePermitHandler(
        makeRequest(`/api/permits/${permitId}/approve`, {
          method: "POST",
          token: safetyOfficerToken,
          body: { slot: "SAFETY_OFFICER" },
        }),
        { params: Promise.resolve({ id: permitId }) }
      );

      await activatePermitHandler(
        makeRequest(`/api/permits/${permitId}/activate`, {
          method: "POST",
          token: requesterToken,
        }),
        { params: Promise.resolve({ id: permitId }) }
      );

      return permitId;
    }

    it("rejects suspension by requester (403)", async () => {
      const permitId = await createActivePermit();
      const req = makeRequest(`/api/permits/${permitId}/suspend`, {
        method: "POST",
        token: requesterToken,
        body: { reason: "Requester wants to suspend" },
      });
      const res = await suspendPermitHandler(req, { params: Promise.resolve({ id: permitId }) });
      expect(res.status).toBe(403);
    });

    it("rejects suspension without reason (422)", async () => {
      const permitId = await createActivePermit();
      const req = makeRequest(`/api/permits/${permitId}/suspend`, {
        method: "POST",
        token: safetyOfficerToken,
        body: { reason: "   " },
      });
      const res = await suspendPermitHandler(req, { params: Promise.resolve({ id: permitId }) });
      expect(res.status).toBe(422);
    });

    it("allows Safety Officer to suspend active permit (200 → SUSPENDED)", async () => {
      const permitId = await createActivePermit();
      const req = makeRequest(`/api/permits/${permitId}/suspend`, {
        method: "POST",
        token: safetyOfficerToken,
        body: { reason: "Gas leak detected nearby; emergency shutdown in progress." },
      });
      const res = await suspendPermitHandler(req, { params: Promise.resolve({ id: permitId }) });
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data.status).toBe("SUSPENDED");
      expect(data.suspensionReason).toMatch(/gas leak/i);
      expect(data.suspendedById).not.toBeNull();

      const audit = await prisma.auditLog.findFirst({
        where: { permitId, action: "SUSPEND" },
      });
      expect(audit).not.toBeNull();
      expect(audit?.fromValue).toBe("ACTIVE");
      expect(audit?.toValue).toBe("SUSPENDED");
    });

    it("allows Safety Officer to resume suspended permit (200 → ACTIVE)", async () => {
      const permitId = await createActivePermit();

      // Suspend
      await suspendPermitHandler(
        makeRequest(`/api/permits/${permitId}/suspend`, {
          method: "POST",
          token: safetyOfficerToken,
          body: { reason: "Temporary halt" },
        }),
        { params: Promise.resolve({ id: permitId }) }
      );

      // Resume
      const resumeReq = makeRequest(`/api/permits/${permitId}/resume`, {
        method: "POST",
        token: safetyOfficerToken,
      });
      const resumeRes = await resumePermitHandler(resumeReq, { params: Promise.resolve({ id: permitId }) });
      expect(resumeRes.status).toBe(200);
      const { data } = await resumeRes.json();
      expect(data.status).toBe("ACTIVE");

      const audit = await prisma.auditLog.findFirst({
        where: { permitId, action: "RESUME" },
      });
      expect(audit).not.toBeNull();
      expect(audit?.fromValue).toBe("SUSPENDED");
      expect(audit?.toValue).toBe("ACTIVE");
    });
  });

  // -------------------------------------------------------------
  // 7. Permit Closure & Verification (ACTIVE → CLOSED → CLOSED_VERIFIED)
  // -------------------------------------------------------------
  describe("Closure & Verification", () => {
    async function createActivePermit(): Promise<string> {
      const now = new Date();
      const start = new Date(now.getTime() - 1000 * 60 * 10);
      const end = new Date(start.getTime() + 1000 * 60 * 60 * 4);

      const permitId = await createAndSubmitPermit({
        equipmentId: pressEquipmentId,
        plannedStartTime: start,
        plannedEndTime: end,
      });

      await approvePermitHandler(
        makeRequest(`/api/permits/${permitId}/approve`, {
          method: "POST",
          token: pressAreaOwnerToken,
          body: { slot: "AREA_OWNER" },
        }),
        { params: Promise.resolve({ id: permitId }) }
      );
      await approvePermitHandler(
        makeRequest(`/api/permits/${permitId}/approve`, {
          method: "POST",
          token: safetyOfficerToken,
          body: { slot: "SAFETY_OFFICER" },
        }),
        { params: Promise.resolve({ id: permitId }) }
      );

      await activatePermitHandler(
        makeRequest(`/api/permits/${permitId}/activate`, {
          method: "POST",
          token: requesterToken,
        }),
        { params: Promise.resolve({ id: permitId }) }
      );

      return permitId;
    }

    it("rejects closure without housekeeping notes (422)", async () => {
      const permitId = await createActivePermit();
      const req = makeRequest(`/api/permits/${permitId}/close`, {
        method: "POST",
        token: requesterToken,
        body: { workCompletionNotes: "" },
      });
      const res = await closePermitHandler(req, { params: Promise.resolve({ id: permitId }) });
      expect(res.status).toBe(422);
    });

    it("allows requester to close active permit with completion notes (200 → CLOSED)", async () => {
      const permitId = await createActivePermit();
      const req = makeRequest(`/api/permits/${permitId}/close`, {
        method: "POST",
        token: requesterToken,
        body: { workCompletionNotes: "Flange welding completed, tools removed, area cleaned." },
      });
      const res = await closePermitHandler(req, { params: Promise.resolve({ id: permitId }) });
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data.status).toBe("CLOSED");
      expect(data.actualEndTime).not.toBeNull();
      expect(data.closedById).not.toBeNull();
      expect(data.workCompletionNotes).toMatch(/flange welding/i);
    });

    it("strictly blocks requester from verifying closure of their own permit (403)", async () => {
      const permitId = await createActivePermit();

      // Close it
      await closePermitHandler(
        makeRequest(`/api/permits/${permitId}/close`, {
          method: "POST",
          token: requesterToken,
          body: { workCompletionNotes: "Work complete" },
        }),
        { params: Promise.resolve({ id: permitId }) }
      );

      // Requester tries to verify closure
      const req = makeRequest(`/api/permits/${permitId}/verify-closure`, {
        method: "POST",
        token: requesterToken,
      });
      const res = await verifyClosureHandler(req, { params: Promise.resolve({ id: permitId }) });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.message).toMatch(/Safety Officer or an Administrator/i);
    });

    it("strictly enforces separation of duties: verifier cannot be the person who closed the permit (403)", async () => {
      const permitId = await createActivePermit();

      // Admin closes the permit
      await closePermitHandler(
        makeRequest(`/api/permits/${permitId}/close`, {
          method: "POST",
          token: adminToken,
          body: { workCompletionNotes: "Closed by Admin" },
        }),
        { params: Promise.resolve({ id: permitId }) }
      );

      // Same Admin tries to verify closure
      const req = makeRequest(`/api/permits/${permitId}/verify-closure`, {
        method: "POST",
        token: adminToken,
      });
      const res = await verifyClosureHandler(req, { params: Promise.resolve({ id: permitId }) });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.message).toMatch(/separation of duties/i);
    });

    it("allows Safety Officer to verify closure (200 → CLOSED_VERIFIED)", async () => {
      const permitId = await createActivePermit();

      // Close by requester
      await closePermitHandler(
        makeRequest(`/api/permits/${permitId}/close`, {
          method: "POST",
          token: requesterToken,
          body: { workCompletionNotes: "Work complete and clean" },
        }),
        { params: Promise.resolve({ id: permitId }) }
      );

      // Verify closure by Safety Officer
      const req = makeRequest(`/api/permits/${permitId}/verify-closure`, {
        method: "POST",
        token: safetyOfficerToken,
        body: { closureVerifiedNotes: "Site inspection satisfactory. No sparks/residue." },
      });
      const res = await verifyClosureHandler(req, { params: Promise.resolve({ id: permitId }) });
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data.status).toBe("CLOSED_VERIFIED");
      expect(data.closureVerifiedNotes).toMatch(/site inspection satisfactory/i);

      // Verify audit log
      const audit = await prisma.auditLog.findFirst({
        where: { permitId, action: "VERIFY_CLOSURE" },
      });
      expect(audit).not.toBeNull();
      expect(audit?.fromValue).toBe("CLOSED");
      expect(audit?.toValue).toBe("CLOSED_VERIFIED");
    });
  });

  // -------------------------------------------------------------
  // 8. Cancellation Lifecycle (Any Non-Terminal State → CANCELLED)
  // -------------------------------------------------------------
  describe("Cancellation Lifecycle", () => {
    it("allows requester to cancel a DRAFT permit (200 → CANCELLED)", async () => {

      const createRes = await postPermitsHandler(
        makeRequest("/api/permits", {
          method: "POST",
          token: requesterToken,
          body: getValidHotWorkBody(),
        })
      );
      const { data: draft } = await createRes.json();

      const cancelReq = makeRequest(`/api/permits/${draft.id}/cancel`, {
        method: "POST",
        token: requesterToken,
        body: { reason: "Maintenance work postponed indefinitely." },
      });
      const cancelRes = await cancelPermitHandler(cancelReq, { params: Promise.resolve({ id: draft.id }) });
      expect(cancelRes.status).toBe(200);
      const { data } = await cancelRes.json();
      expect(data.status).toBe("CANCELLED");
      expect(data.cancellationReason).toMatch(/postponed/i);
    });

    it("allows requester to cancel PENDING_APPROVAL permit (200 → CANCELLED)", async () => {
      const permitId = await createAndSubmitPermit();
      const cancelReq = makeRequest(`/api/permits/${permitId}/cancel`, {
        method: "POST",
        token: requesterToken,
        body: { reason: "Contractor unavailable" },
      });
      const cancelRes = await cancelPermitHandler(cancelReq, { params: Promise.resolve({ id: permitId }) });
      expect(cancelRes.status).toBe(200);
      const { data } = await cancelRes.json();
      expect(data.status).toBe("CANCELLED");
    });

    it("strictly blocks requester from cancelling an ACTIVE permit (403)", async () => {
      const now = new Date();
      const start = new Date(now.getTime() - 1000 * 60 * 10);
      const end = new Date(start.getTime() + 1000 * 60 * 60 * 4);

      const permitId = await createAndSubmitPermit({
        equipmentId: pressEquipmentId,
        plannedStartTime: start,
        plannedEndTime: end,
      });

      await approvePermitHandler(
        makeRequest(`/api/permits/${permitId}/approve`, {
          method: "POST",
          token: pressAreaOwnerToken,
          body: { slot: "AREA_OWNER" },
        }),
        { params: Promise.resolve({ id: permitId }) }
      );
      await approvePermitHandler(
        makeRequest(`/api/permits/${permitId}/approve`, {
          method: "POST",
          token: safetyOfficerToken,
          body: { slot: "SAFETY_OFFICER" },
        }),
        { params: Promise.resolve({ id: permitId }) }
      );
      await activatePermitHandler(
        makeRequest(`/api/permits/${permitId}/activate`, {
          method: "POST",
          token: requesterToken,
        }),
        { params: Promise.resolve({ id: permitId }) }
      );

      // Requester tries to cancel ACTIVE permit (bypassing closure)
      const cancelReq = makeRequest(`/api/permits/${permitId}/cancel`, {
        method: "POST",
        token: requesterToken,
        body: { reason: "Bypassing closure" },
      });
      const cancelRes = await cancelPermitHandler(cancelReq, { params: Promise.resolve({ id: permitId }) });
      expect(cancelRes.status).toBe(403);
    });

    it("allows Safety Officer to cancel an ACTIVE permit (200 → CANCELLED)", async () => {
      const now = new Date();
      const start = new Date(now.getTime() - 1000 * 60 * 10);
      const end = new Date(start.getTime() + 1000 * 60 * 60 * 4);

      const permitId = await createAndSubmitPermit({
        equipmentId: pressEquipmentId,
        plannedStartTime: start,
        plannedEndTime: end,
      });

      await approvePermitHandler(
        makeRequest(`/api/permits/${permitId}/approve`, {
          method: "POST",
          token: pressAreaOwnerToken,
          body: { slot: "AREA_OWNER" },
        }),
        { params: Promise.resolve({ id: permitId }) }
      );
      await approvePermitHandler(
        makeRequest(`/api/permits/${permitId}/approve`, {
          method: "POST",
          token: safetyOfficerToken,
          body: { slot: "SAFETY_OFFICER" },
        }),
        { params: Promise.resolve({ id: permitId }) }
      );
      await activatePermitHandler(
        makeRequest(`/api/permits/${permitId}/activate`, {
          method: "POST",
          token: requesterToken,
        }),
        { params: Promise.resolve({ id: permitId }) }
      );

      // Safety officer cancels active permit
      const cancelReq = makeRequest(`/api/permits/${permitId}/cancel`, {
        method: "POST",
        token: safetyOfficerToken,
        body: { reason: "Safety violation observed on site; permit cancelled." },
      });
      const cancelRes = await cancelPermitHandler(cancelReq, { params: Promise.resolve({ id: permitId }) });
      expect(cancelRes.status).toBe(200);
      const { data } = await cancelRes.json();
      expect(data.status).toBe("CANCELLED");
    });
  });

  // -------------------------------------------------------------
  // 9. Terminal State Protection & Audit Immutability
  // -------------------------------------------------------------
  describe("Terminal State Protection & Audit Immutability", () => {
    it("strictly blocks transitions from terminal state CANCELLED (409)", async () => {
      const permitId = await createAndSubmitPermit();

      // Cancel it
      await cancelPermitHandler(
        makeRequest(`/api/permits/${permitId}/cancel`, {
          method: "POST",
          token: requesterToken,
          body: { reason: "Cancel test" },
        }),
        { params: Promise.resolve({ id: permitId }) }
      );

      // Attempt to approve cancelled permit
      const approveRes = await approvePermitHandler(
        makeRequest(`/api/permits/${permitId}/approve`, {
          method: "POST",
          token: safetyOfficerToken,
        }),
        { params: Promise.resolve({ id: permitId }) }
      );
      expect(approveRes.status).toBe(409);

      // Attempt to activate cancelled permit
      const activateRes = await activatePermitHandler(
        makeRequest(`/api/permits/${permitId}/activate`, {
          method: "POST",
          token: requesterToken,
        }),
        { params: Promise.resolve({ id: permitId }) }
      );
      expect(activateRes.status).toBe(409);
    });

    it("verifies audit log trigger blocks any direct UPDATE or DELETE in PostgreSQL", async () => {
      const permitId = await createAndSubmitPermit();
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { permitId, action: "SUBMIT" },
      });

      // Attempting to UPDATE the audit record must fail at the PostgreSQL trigger level
      await expect(
        prisma.$executeRaw`UPDATE "AuditLog" SET "comment" = 'Tampered' WHERE "id" = ${audit.id}`
      ).rejects.toThrow();

      // Attempting to DELETE the audit record must fail at the PostgreSQL trigger level
      await expect(
        prisma.$executeRaw`DELETE FROM "AuditLog" WHERE "id" = ${audit.id}`
      ).rejects.toThrow();
    });
  });
});
