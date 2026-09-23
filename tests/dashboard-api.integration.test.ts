import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import fs from "fs";
import EmbeddedPostgres from "embedded-postgres";
import { prisma, resetPrismaClient } from "../src/lib/prisma";
import { POST as loginHandler } from "../src/app/api/auth/login/route";
import { GET as getDashboardHandler } from "../src/app/api/dashboard/route";
import { GET as getPermitDetailHandler } from "../src/app/api/permits/[id]/route";
import { GET as getPermitActionsHandler } from "../src/app/api/permits/[id]/actions/route";
import { POST as postPermitsHandler } from "../src/app/api/permits/route";
import { POST as submitPermitHandler } from "../src/app/api/permits/[id]/submit/route";
import { POST as approvePermitHandler } from "../src/app/api/permits/[id]/approve/route";
import { POST as activatePermitHandler } from "../src/app/api/permits/[id]/activate/route";
import { POST as suspendPermitHandler } from "../src/app/api/permits/[id]/suspend/route";
import { POST as resumePermitHandler } from "../src/app/api/permits/[id]/resume/route";
import { POST as closePermitHandler } from "../src/app/api/permits/[id]/close/route";
import { POST as verifyClosureHandler } from "../src/app/api/permits/[id]/verify-closure/route";
import { POST as postEntryLogHandler } from "../src/app/api/permits/[id]/entry-logs/route";
import { AUTH_COOKIE_NAME } from "../src/lib/auth";

const DB_PORT = 54335;
const DB_NAME = "opmaint_dashboard_test";
const TEST_DATABASE_URL = `postgresql://postgres:password@localhost:${DB_PORT}/${DB_NAME}?schema=public`;

async function loginAndGetToken(email: string): Promise<string> {
  const req = new Request("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "password123" }),
  });
  const res = await loginHandler(req);
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error(`No Set-Cookie returned for ${email}`);
  const match = setCookie.match(new RegExp(`${AUTH_COOKIE_NAME}=([^;]+)`));
  if (!match) throw new Error(`AUTH_COOKIE_NAME cookie not found for ${email}`);
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

describe("Phase 6 Dashboard & Supporting APIs (PostgreSQL)", { timeout: 180000 }, () => {
  let pgServer: EmbeddedPostgres;

  let requesterToken: string;
  let otherRequesterToken: string;
  let areaOwnerToken: string;
  let paintAreaOwnerToken: string;
  let safetyOfficerToken: string;

  let pressEquipmentId: string;
  let pressAreaId: string;

  beforeAll(async () => {
    // 0. Kill lingering process on DB_PORT
    try {
      execSync(
        `powershell -Command "Get-NetTCPConnection -LocalPort ${DB_PORT} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`,
        { stdio: "ignore" }
      );
    } catch {}

    if (
      !fs.existsSync(".embedded-pg-dashboard-data/PG_VERSION") &&
      fs.existsSync(".embedded-pg-dashboard-data")
    ) {
      try {
        fs.rmSync(".embedded-pg-dashboard-data", { recursive: true, force: true });
      } catch {}
    }

    // 1. Start embedded postgres
    pgServer = new EmbeddedPostgres({
      databaseDir: ".embedded-pg-dashboard-data",
      port: DB_PORT,
      user: "postgres",
      password: "password",
      persistent: true,
      onLog: () => {},
      onError: () => {},
    });
    if (!fs.existsSync(".embedded-pg-dashboard-data/PG_VERSION")) {
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

    // Create other requester
    const bcrypt = await import("bcryptjs");
    const passwordHash = await bcrypt.hash("password123", 10);
    await prisma.user.upsert({
      where: { email: "other.requester6@opmaint.local" },
      create: {
        name: "Other Requester 6",
        email: "other.requester6@opmaint.local",
        passwordHash,
        role: "REQUESTER",
      },
      update: {},
    });

    // Resolve equipments
    const pressEquip = await prisma.equipment.findFirstOrThrow({
      where: { area: { code: "PRESS_SHOP" } },
      include: { area: true },
    });
    pressEquipmentId = pressEquip.id;
    pressAreaId = pressEquip.areaId;

    // Tokens
    requesterToken = await loginAndGetToken("requester@opmaint.local");
    otherRequesterToken = await loginAndGetToken("other.requester6@opmaint.local");
    areaOwnerToken = await loginAndGetToken("ao.press@opmaint.local");
    paintAreaOwnerToken = await loginAndGetToken("ao.paint@opmaint.local");
    safetyOfficerToken = await loginAndGetToken("safety.officer@opmaint.local");
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

  function getValidHotWorkPrecautions() {
    return {
      fire_watch: true,
      combustibles_cleared: true,
      floor_covered: true,
      gas_tested: true,
      ventilation_adequate: true,
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

  // =========================================================================
  // 1. AUTHENTICATION & ACCESS
  // =========================================================================
  describe("1. Authentication & Guard Rules", () => {
    it("rejects unauthenticated GET /api/dashboard with 401", async () => {
      const req = makeRequest("/api/dashboard");
      const res = await getDashboardHandler(req);
      expect(res.status).toBe(401);
    });

    it("rejects unauthenticated GET /api/permits/:id/actions with 401", async () => {
      const req = makeRequest("/api/permits/some-id/actions");
      const res = await getPermitActionsHandler(req, { params: Promise.resolve({ id: "some-id" }) });
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // 2. DASHBOARD DATA & FILTERS
  // =========================================================================
  describe("2. Dashboard Endpoints & Query Filtering", () => {
    it("returns frontend-ready dashboard payload with permits, summaries, and operational sections", async () => {
      const req = makeRequest("/api/dashboard", { token: requesterToken });
      const res = await getDashboardHandler(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data.permits)).toBe(true);
      expect(body.data.pagination).toBeDefined();
      expect(typeof body.data.pagination.total).toBe("number");
      expect(Array.isArray(body.data.activePermits)).toBe(true);
      expect(Array.isArray(body.data.expiringPermits)).toBe(true);
      expect(Array.isArray(body.data.myPendingApprovals)).toBe(true);
      expect(body.data.summary).toBeDefined();
      expect(typeof body.data.summary.total).toBe("number");
      expect(typeof body.data.summary.active).toBe("number");
      expect(typeof body.data.summary.myPermitsCount).toBe("number");
      expect(typeof body.data.summary.expiringSoonCount).toBe("number");
    });

    it("supports status filter (e.g., status=DRAFT)", async () => {
      const req = makeRequest("/api/dashboard?status=DRAFT", { token: requesterToken });
      const res = await getDashboardHandler(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      for (const p of body.data.permits) {
        expect(p.status).toBe("DRAFT");
      }
    });

    it("supports permit type filter (e.g., type=HOT_WORK)", async () => {
      const req = makeRequest("/api/dashboard?type=HOT_WORK", { token: requesterToken });
      const res = await getDashboardHandler(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      for (const p of body.data.permits) {
        expect(p.type).toBe("HOT_WORK");
      }
    });

    it("supports areaId filter", async () => {
      const req = makeRequest(`/api/dashboard?areaId=${pressAreaId}`, { token: requesterToken });
      const res = await getDashboardHandler(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      for (const p of body.data.permits) {
        expect(p.equipment.area.id).toBe(pressAreaId);
      }
    });

    it("supports mine=true filter to show only permits requested by authenticated user", async () => {
      const req = makeRequest("/api/dashboard?mine=true", { token: requesterToken });
      const res = await getDashboardHandler(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      const me = await prisma.user.findUniqueOrThrow({ where: { email: "requester@opmaint.local" } });
      for (const p of body.data.permits) {
        expect(p.requesterId).toBe(me.id);
      }
    });
  });

  // =========================================================================
  // 3. APPROVAL OBLIGATIONS (myApprovals=true)
  // =========================================================================
  describe("3. Pending Approval Obligations (myApprovals=true)", () => {
    it("returns 0 pending approvals for a REQUESTER (cannot approve)", async () => {
      const req = makeRequest("/api/dashboard?myApprovals=true", { token: requesterToken });
      const res = await getDashboardHandler(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.permits.length).toBe(0);
      expect(body.data.pagination.total).toBe(0);
    });

    it("identifies pending approvals for Area Owner strictly in their assigned area", async () => {
      // Create and submit a permit for Press Shop
      const startTime = new Date(Date.now() + 3600000);
      const endTime = new Date(Date.now() + 5 * 3600000);
      const createReq = makeRequest("/api/permits", {
        token: requesterToken,
        method: "POST",
        body: {
          type: "HOT_WORK",
          contractorTeam: "Press Fabrication Team",
          workDescription: "Welding on press equipment structure.",
          equipmentId: pressEquipmentId,
          plannedStartTime: startTime.toISOString(),
          plannedEndTime: endTime.toISOString(),
          hazards: ["Fire Hazard"],
          ppeRequired: ["Gloves", "Boots"],
          precautionsChecklist: getValidHotWorkPrecautions(),
          typeData: getValidHotWorkData(),
        },
      });
      const createRes = await postPermitsHandler(createReq);
      expect(createRes.status).toBe(201);
      const { data: created } = await createRes.json();

      // Submit
      const submitRes = await submitPermitHandler(
        makeRequest(`/api/permits/${created.id}/submit`, { token: requesterToken, method: "POST" }),
        { params: Promise.resolve({ id: created.id }) }
      );
      expect(submitRes.status).toBe(200);

      // 1. Press Area Owner checks myApprovals=true -> must see this permit
      const aoReq = makeRequest("/api/dashboard?myApprovals=true", { token: areaOwnerToken });
      const aoRes = await getDashboardHandler(aoReq);
      expect(aoRes.status).toBe(200);
      const aoBody = await aoRes.json();
      const ids = aoBody.data.permits.map((p: { id: string }) => p.id);
      expect(ids).toContain(created.id);

      // 2. Paint Area Owner checks myApprovals=true -> must NOT see this permit (different area)
      const paintReq = makeRequest("/api/dashboard?myApprovals=true", { token: paintAreaOwnerToken });
      const paintRes = await getDashboardHandler(paintReq);
      expect(paintRes.status).toBe(200);
      const paintBody = await paintRes.json();
      const paintIds = paintBody.data.permits.map((p: { id: string }) => p.id);
      expect(paintIds).not.toContain(created.id);

      // 3. Safety Officer checks myApprovals=true -> must see this permit (safety slot pending)
      const soReq = makeRequest("/api/dashboard?myApprovals=true", { token: safetyOfficerToken });
      const soRes = await getDashboardHandler(soReq);
      expect(soRes.status).toBe(200);
      const soBody = await soRes.json();
      const soIds = soBody.data.permits.map((p: { id: string }) => p.id);
      expect(soIds).toContain(created.id);

      // 4. Area Owner approves their slot
      const appRes = await approvePermitHandler(
        makeRequest(`/api/permits/${created.id}/approve`, {
          token: areaOwnerToken,
          method: "POST",
          body: { slot: "AREA_OWNER", comment: "Approved by press AO" },
        }),
        { params: Promise.resolve({ id: created.id }) }
      );
      expect(appRes.status).toBe(200);

      // 5. Area Owner checks myApprovals=true again -> completed slot must NOT remain pending
      const aoReq2 = makeRequest("/api/dashboard?myApprovals=true", { token: areaOwnerToken });
      const aoRes2 = await getDashboardHandler(aoReq2);
      const aoBody2 = await aoRes2.json();
      const ids2 = aoBody2.data.permits.map((p: { id: string }) => p.id);
      expect(ids2).not.toContain(created.id);
    });
  });

  // =========================================================================
  // 4. ACTIVE NOW & EXPIRING NEXT 2 HOURS
  // =========================================================================
  describe("4. Active Now & Expiring Next 2 Hours Guards", () => {
    it("returns active permits in activePermits and strictly excludes expired active permits", async () => {
      // Create, submit, approve, and activate permit
      const startTime = new Date(Date.now() - 3600000); // 1h ago
      const endTime = new Date(Date.now() + 4 * 3600000); // 4h in future (not expiring soon)

      const createRes = await postPermitsHandler(
        makeRequest("/api/permits", {
          token: requesterToken,
          method: "POST",
          body: {
            type: "HOT_WORK",
            contractorTeam: "Active Contractor Team",
            workDescription: "Active permit in progress.",
            equipmentId: pressEquipmentId,
            plannedStartTime: startTime.toISOString(),
            plannedEndTime: endTime.toISOString(),
            hazards: ["Sparks"],
            ppeRequired: ["Gloves"],
            precautionsChecklist: getValidHotWorkPrecautions(),
            typeData: getValidHotWorkData(),
          },
        })
      );
      const { data: created } = await createRes.json();

      await submitPermitHandler(
        makeRequest(`/api/permits/${created.id}/submit`, { token: requesterToken, method: "POST" }),
        { params: Promise.resolve({ id: created.id }) }
      );
      await approvePermitHandler(
        makeRequest(`/api/permits/${created.id}/approve`, { token: areaOwnerToken, method: "POST", body: { slot: "AREA_OWNER" } }),
        { params: Promise.resolve({ id: created.id }) }
      );
      await approvePermitHandler(
        makeRequest(`/api/permits/${created.id}/approve`, { token: safetyOfficerToken, method: "POST", body: { slot: "SAFETY_OFFICER" } }),
        { params: Promise.resolve({ id: created.id }) }
      );
      await activatePermitHandler(
        makeRequest(`/api/permits/${created.id}/activate`, { token: requesterToken, method: "POST" }),
        { params: Promise.resolve({ id: created.id }) }
      );

      // Verify it appears in activePermits
      const dashRes = await getDashboardHandler(makeRequest("/api/dashboard", { token: requesterToken }));
      const { data: dash } = await dashRes.json();
      const activeIds = dash.activePermits.map((p: { id: string }) => p.id);
      expect(activeIds).toContain(created.id);

      // Expiry window is 4h, so it must NOT appear in expiringPermits (next 2 hours)
      const expiringIds = dash.expiringPermits.map((p: { id: string }) => p.id);
      expect(expiringIds).not.toContain(created.id);

      // Now set its expiresAt to 1 hour in the future (< 2 hours)
      const expiringSoonTime = new Date(Date.now() + 3600000);
      await prisma.permit.update({
        where: { id: created.id },
        data: { plannedEndTime: expiringSoonTime, expiresAt: expiringSoonTime },
      });

      const dashRes2 = await getDashboardHandler(makeRequest("/api/dashboard", { token: requesterToken }));
      const { data: dash2 } = await dashRes2.json();
      const expiringIds2 = dash2.expiringPermits.map((p: { id: string }) => p.id);
      expect(expiringIds2).toContain(created.id);

      // Now set its expiresAt to 10 minutes in past (already expired)
      const expiredTime = new Date(Date.now() - 600000);
      await prisma.permit.update({
        where: { id: created.id },
        data: { plannedEndTime: expiredTime, expiresAt: expiredTime },
      });

      const dashRes3 = await getDashboardHandler(makeRequest("/api/dashboard", { token: requesterToken }));
      const { data: dash3 } = await dashRes3.json();
      const activeIds3 = dash3.activePermits.map((p: { id: string }) => p.id);
      const expiringIds3 = dash3.expiringPermits.map((p: { id: string }) => p.id);
      // Already expired permits must NOT appear as active or expiring soon
      expect(activeIds3).not.toContain(created.id);
      expect(expiringIds3).not.toContain(created.id);
    });
  });

  // =========================================================================
  // 5. PERMIT DETAIL API & ENRICHMENT
  // =========================================================================
  describe("5. Enriched Permit Detail (GET /api/permits/:id)", () => {
    it("returns full permit detail with approvals, approvalStatus, audit timeline, and roster", async () => {
      // Create and activate a confined space permit
      const startTime = new Date(Date.now() - 3600000);
      const endTime = new Date(Date.now() + 6 * 3600000);

      const createRes = await postPermitsHandler(
        makeRequest("/api/permits", {
          token: requesterToken,
          method: "POST",
          body: {
            type: "CONFINED_SPACE_ENTRY",
            contractorTeam: "Tank Cleaning Unit",
            workDescription: "Deep clean boiler tank internals.",
            equipmentId: pressEquipmentId,
            plannedStartTime: startTime.toISOString(),
            plannedEndTime: endTime.toISOString(),
            hazards: ["Toxic Atmosphere"],
            ppeRequired: ["Harness", "Gas Monitor"],
            precautionsChecklist: getValidConfinedSpacePrecautions(),
            typeData: getValidConfinedSpaceData(),
          },
        })
      );
      const { data: created } = await createRes.json();

      await submitPermitHandler(makeRequest(`/api/permits/${created.id}/submit`, { token: requesterToken, method: "POST" }), { params: Promise.resolve({ id: created.id }) });
      await approvePermitHandler(makeRequest(`/api/permits/${created.id}/approve`, { token: areaOwnerToken, method: "POST", body: { slot: "AREA_OWNER" } }), { params: Promise.resolve({ id: created.id }) });
      await approvePermitHandler(makeRequest(`/api/permits/${created.id}/approve`, { token: safetyOfficerToken, method: "POST", body: { slot: "SAFETY_OFFICER" } }), { params: Promise.resolve({ id: created.id }) });
      await activatePermitHandler(makeRequest(`/api/permits/${created.id}/activate`, { token: requesterToken, method: "POST" }), { params: Promise.resolve({ id: created.id }) });

      // Log an ENTRY
      await postEntryLogHandler(
        makeRequest(`/api/permits/${created.id}/entry-logs`, {
          token: requesterToken,
          method: "POST",
          body: { direction: "ENTRY", personName: "Rohan Entrant" },
        }),
        { params: Promise.resolve({ id: created.id }) }
      );

      // Fetch detail as Area Owner
      const detailRes = await getPermitDetailHandler(
        makeRequest(`/api/permits/${created.id}`, { token: areaOwnerToken }),
        { params: Promise.resolve({ id: created.id }) }
      );
      expect(detailRes.status).toBe(200);
      const { data: detail } = await detailRes.json();

      // Check fields
      expect(detail.permitNumber).toBeDefined();
      expect(detail.type).toBe("CONFINED_SPACE_ENTRY");
      expect(detail.status).toBe("ACTIVE");
      expect(detail.equipment).toBeDefined();
      expect(detail.equipment.area).toBeDefined();
      expect(detail.equipment.area.plant).toBeDefined();
      expect(Array.isArray(detail.approvals)).toBe(true);
      expect(detail.approvals.length).toBe(2);
      expect(detail.approvalStatus).toBeDefined();
      expect(detail.approvalStatus.allSlotsFilled).toBe(true);
      expect(Array.isArray(detail.auditLogs)).toBe(true);
      expect(detail.auditLogs.length).toBeGreaterThan(0);
      expect(Array.isArray(detail.entryExitLogs)).toBe(true);
      expect(detail.roster).toBeDefined();
      expect(detail.roster.headcount).toBe(1);
      expect(detail.roster.currentlyInside).toEqual(["Rohan Entrant"]);
    });
  });

  // =========================================================================
  // 6. AVAILABLE ACTIONS API (GET /api/permits/:id/actions)
  // =========================================================================
  describe("6. Available Actions API", () => {
    it("returns correct actions for DRAFT: requester sees SUBMIT, EDIT, CANCEL; others see none", async () => {
      const startTime = new Date(Date.now() + 3600000);
      const endTime = new Date(Date.now() + 5 * 3600000);

      const createRes = await postPermitsHandler(
        makeRequest("/api/permits", {
          token: requesterToken,
          method: "POST",
          body: {
            type: "HOT_WORK",
            contractorTeam: "Draft Testing Team",
            workDescription: "Draft testing work description.",
            equipmentId: pressEquipmentId,
            plannedStartTime: startTime.toISOString(),
            plannedEndTime: endTime.toISOString(),
            hazards: ["Fire"],
            ppeRequired: ["Gloves"],
            precautionsChecklist: getValidHotWorkPrecautions(),
            typeData: getValidHotWorkData(),
          },
        })
      );
      const { data: draft } = await createRes.json();

      // Requester views actions
      const reqActionsRes = await getPermitActionsHandler(
        makeRequest(`/api/permits/${draft.id}/actions`, { token: requesterToken }),
        { params: Promise.resolve({ id: draft.id }) }
      );
      expect(reqActionsRes.status).toBe(200);
      const { data: reqActions } = await reqActionsRes.json();
      expect(reqActions.actions).toContain("SUBMIT");
      expect(reqActions.actions).toContain("EDIT");
      expect(reqActions.actions).toContain("CANCEL");
      expect(reqActions.actions).not.toContain("APPROVE");
      expect(reqActions.actions).not.toContain("ACTIVATE");

      // Other requester views actions on this permit
      const otherActionsRes = await getPermitActionsHandler(
        makeRequest(`/api/permits/${draft.id}/actions`, { token: otherRequesterToken }),
        { params: Promise.resolve({ id: draft.id }) }
      );
      expect(otherActionsRes.status).toBe(200);
      const { data: otherActions } = await otherActionsRes.json();
      expect(otherActions.actions).toEqual([]); // Not their draft
    });

    it("returns APPROVE and REJECT for Area Owner on PENDING_APPROVAL; forbids self-approval for requester", async () => {
      const startTime = new Date(Date.now() + 3600000);
      const endTime = new Date(Date.now() + 5 * 3600000);

      const createRes = await postPermitsHandler(
        makeRequest("/api/permits", {
          token: requesterToken,
          method: "POST",
          body: {
            type: "HOT_WORK",
            contractorTeam: "Approval Actions Team",
            workDescription: "Checking approval actions endpoint.",
            equipmentId: pressEquipmentId,
            plannedStartTime: startTime.toISOString(),
            plannedEndTime: endTime.toISOString(),
            hazards: ["Fire"],
            ppeRequired: ["Gloves"],
            precautionsChecklist: getValidHotWorkPrecautions(),
            typeData: getValidHotWorkData(),
          },
        })
      );
      const { data: created } = await createRes.json();

      await submitPermitHandler(
        makeRequest(`/api/permits/${created.id}/submit`, { token: requesterToken, method: "POST" }),
        { params: Promise.resolve({ id: created.id }) }
      );

      // 1. Area Owner actions
      const aoActionsRes = await getPermitActionsHandler(
        makeRequest(`/api/permits/${created.id}/actions`, { token: areaOwnerToken }),
        { params: Promise.resolve({ id: created.id }) }
      );
      const { data: aoActions } = await aoActionsRes.json();
      expect(aoActions.actions).toContain("APPROVE");
      expect(aoActions.actions).toContain("REJECT");
      const approveDetail = aoActions.details.find((d: { action: string }) => d.action === "APPROVE");
      expect(approveDetail.eligibleSlots).toContain("AREA_OWNER");

      // 2. Requester actions on their own pending permit (cannot self-approve; can CANCEL)
      const reqActionsRes = await getPermitActionsHandler(
        makeRequest(`/api/permits/${created.id}/actions`, { token: requesterToken }),
        { params: Promise.resolve({ id: created.id }) }
      );
      const { data: reqActions } = await reqActionsRes.json();
      expect(reqActions.actions).not.toContain("APPROVE");
      expect(reqActions.actions).not.toContain("REJECT");
      expect(reqActions.actions).not.toContain("EDIT"); // Edit forbidden post-submission
      expect(reqActions.actions).toContain("CANCEL");
    });

    it("returns correct actions for ACTIVE, SUSPENDED, and terminal states", async () => {
      const startTime = new Date(Date.now() - 3600000);
      const endTime = new Date(Date.now() + 6 * 3600000);

      const createRes = await postPermitsHandler(
        makeRequest("/api/permits", {
          token: requesterToken,
          method: "POST",
          body: {
            type: "HOT_WORK",
            contractorTeam: "Lifecycle Actions Team",
            workDescription: "Lifecycle actions verification.",
            equipmentId: pressEquipmentId,
            plannedStartTime: startTime.toISOString(),
            plannedEndTime: endTime.toISOString(),
            hazards: ["Fire"],
            ppeRequired: ["Gloves"],
            precautionsChecklist: getValidHotWorkPrecautions(),
            typeData: getValidHotWorkData(),
          },
        })
      );
      const { data: created } = await createRes.json();

      await submitPermitHandler(makeRequest(`/api/permits/${created.id}/submit`, { token: requesterToken, method: "POST" }), { params: Promise.resolve({ id: created.id }) });
      await approvePermitHandler(makeRequest(`/api/permits/${created.id}/approve`, { token: areaOwnerToken, method: "POST", body: { slot: "AREA_OWNER" } }), { params: Promise.resolve({ id: created.id }) });
      await approvePermitHandler(makeRequest(`/api/permits/${created.id}/approve`, { token: safetyOfficerToken, method: "POST", body: { slot: "SAFETY_OFFICER" } }), { params: Promise.resolve({ id: created.id }) });
      await activatePermitHandler(makeRequest(`/api/permits/${created.id}/activate`, { token: requesterToken, method: "POST" }), { params: Promise.resolve({ id: created.id }) });

      // In ACTIVE status:
      // Requester sees LOG_WORK, CLOSE (cannot CANCEL to bypass closure inspection)
      const reqActive = await getPermitActionsHandler(
        makeRequest(`/api/permits/${created.id}/actions`, { token: requesterToken }),
        { params: Promise.resolve({ id: created.id }) }
      );
      const { data: act1 } = await reqActive.json();
      expect(act1.actions).toContain("LOG_WORK");
      expect(act1.actions).toContain("CLOSE");
      expect(act1.actions).not.toContain("CANCEL");
      expect(act1.actions).not.toContain("SUSPEND");

      // Safety officer sees SUSPEND, LOG_WORK, CANCEL
      const soActive = await getPermitActionsHandler(
        makeRequest(`/api/permits/${created.id}/actions`, { token: safetyOfficerToken }),
        { params: Promise.resolve({ id: created.id }) }
      );
      const { data: act2 } = await soActive.json();
      expect(act2.actions).toContain("SUSPEND");
      expect(act2.actions).toContain("LOG_WORK");
      expect(act2.actions).toContain("CANCEL");

      // Suspend permit
      await suspendPermitHandler(
        makeRequest(`/api/permits/${created.id}/suspend`, { token: safetyOfficerToken, method: "POST", body: { reason: "Routine safety pause" } }),
        { params: Promise.resolve({ id: created.id }) }
      );

      // In SUSPENDED status: Safety Officer sees RESUME
      const soSuspended = await getPermitActionsHandler(
        makeRequest(`/api/permits/${created.id}/actions`, { token: safetyOfficerToken }),
        { params: Promise.resolve({ id: created.id }) }
      );
      const { data: act3 } = await soSuspended.json();
      expect(act3.actions).toContain("RESUME");
      expect(act3.actions).not.toContain("LOG_WORK"); // Work logging rejected while suspended

      // Resume permit
      await resumePermitHandler(
        makeRequest(`/api/permits/${created.id}/resume`, { token: safetyOfficerToken, method: "POST" }),
        { params: Promise.resolve({ id: created.id }) }
      );

      // Close permit
      await closePermitHandler(
        makeRequest(`/api/permits/${created.id}/close`, { token: requesterToken, method: "POST", body: { workCompletionNotes: "Job done cleanly" } }),
        { params: Promise.resolve({ id: created.id }) }
      );

      // In CLOSED status: Safety Officer sees VERIFY_CLOSURE
      const soClosed = await getPermitActionsHandler(
        makeRequest(`/api/permits/${created.id}/actions`, { token: safetyOfficerToken }),
        { params: Promise.resolve({ id: created.id }) }
      );
      const { data: act4 } = await soClosed.json();
      expect(act4.actions).toContain("VERIFY_CLOSURE");

      // Verify closure -> CLOSED_VERIFIED (terminal)
      await verifyClosureHandler(
        makeRequest(`/api/permits/${created.id}/verify-closure`, { token: safetyOfficerToken, method: "POST", body: { notes: "Verified in order" } }),
        { params: Promise.resolve({ id: created.id }) }
      );

      // Terminal state -> No actions available
      const terminalRes = await getPermitActionsHandler(
        makeRequest(`/api/permits/${created.id}/actions`, { token: safetyOfficerToken }),
        { params: Promise.resolve({ id: created.id }) }
      );
      const { data: terminal } = await terminalRes.json();
      expect(terminal.actions).toEqual([]);
    });
  });

  // =========================================================================
  // 7. PAGINATION & ORDERING
  // =========================================================================
  describe("7. Pagination & Result Ordering", () => {
    it("respects page and pageSize query parameters on dashboard permits list", async () => {
      const req = makeRequest("/api/dashboard?page=1&pageSize=2", { token: requesterToken });
      const res = await getDashboardHandler(req);
      expect(res.status).toBe(200);
      const { data } = await res.json();

      expect(data.permits.length).toBeLessThanOrEqual(2);
      expect(data.pagination.page).toBe(1);
      expect(data.pagination.pageSize).toBe(2);
      expect(data.pagination.totalPages).toBeGreaterThanOrEqual(1);
    });
  });
});
