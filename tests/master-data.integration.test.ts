/**
 * Master Data API Integration Tests (Plants, Areas, Equipment)
 *
 * Uses a dedicated embedded PostgreSQL instance on port 54330.
 * Tokens are obtained via the real login route — never minted synthetically.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import fs from "fs";
import EmbeddedPostgres from "embedded-postgres";
import { Role } from "@prisma/client";
import { hashPassword, AUTH_COOKIE_NAME } from "../src/lib/auth";
import { prisma, resetPrismaClient } from "../src/lib/prisma";
import { POST as loginHandler } from "../src/app/api/auth/login/route";
import { GET as getPlantsHandler, POST as postPlantsHandler } from "../src/app/api/plants/route";
import { GET as getPlantByIdHandler, PATCH as patchPlantHandler } from "../src/app/api/plants/[id]/route";
import { GET as getAreasHandler, POST as postAreasHandler } from "../src/app/api/areas/route";
import { GET as getAreaByIdHandler } from "../src/app/api/areas/[id]/route";
import { GET as getEquipmentHandler, POST as postEquipmentHandler } from "../src/app/api/equipment/route";
import { GET as getEquipmentByIdHandler } from "../src/app/api/equipment/[id]/route";

const DB_PORT = 54330;
const DB_NAME = "opmaint_masterdata_test";
const TEST_DATABASE_URL = `postgresql://postgres:password@localhost:${DB_PORT}/${DB_NAME}?schema=public`;
const RAW_PASSWORD = "Test1234!";

// ---------- helpers ----------

/**
 * Logs in as the given user via the real login handler and extracts the
 * session cookie value, so the JWT is signed with the same secret the
 * route handlers will verify against.
 */
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
  // Extract cookie value from Set-Cookie header
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

describe("Master Data APIs Integration (PostgreSQL)", { timeout: 60000 }, () => {
  let pgServer: EmbeddedPostgres;

  let adminId: string;
  let areaOwnerId: string;
  let inactiveUserId: string;

  let adminToken: string;
  let requesterToken: string;
  let safetyOfficerToken: string;
  let areaOwnerToken: string;

  let plantId: string;
  let areaId: string;
  let equipmentId: string;

  beforeAll(async () => {
    // 0. Kill lingering process on DB_PORT
    try {
      execSync(
        `powershell -Command "Get-NetTCPConnection -LocalPort ${DB_PORT} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`,
        { stdio: "ignore" }
      );
    } catch {}

    if (!fs.existsSync(".embedded-pg-masterdata-data/PG_VERSION") &&
        fs.existsSync(".embedded-pg-masterdata-data")) {
      try { fs.rmSync(".embedded-pg-masterdata-data", { recursive: true, force: true }); } catch {}
    }

    pgServer = new EmbeddedPostgres({
      port: DB_PORT,
      databaseDir: ".embedded-pg-masterdata-data",
      user: "postgres",
      password: "password",
      persistent: true,
      onLog: () => {},
      onError: () => {},
    });

    if (!fs.existsSync(".embedded-pg-masterdata-data/PG_VERSION")) {
      await pgServer.initialise();
    }
    await pgServer.start();

    try { await pgServer.dropDatabase(DB_NAME); } catch {}
    await pgServer.createDatabase(DB_NAME);

    process.env.DATABASE_URL = TEST_DATABASE_URL;
    resetPrismaClient();

    execSync("npx prisma migrate deploy", {
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      stdio: "pipe",
    });

    await prisma.$connect();

    // Seed test users
    const passwordHash = await hashPassword(RAW_PASSWORD);

    const admin = await prisma.user.create({
      data: { email: "admin@md.test", name: "Admin User", role: "ADMIN", passwordHash, isActive: true },
    });
    adminId = admin.id;

    const requester = await prisma.user.create({
      data: { email: "requester@md.test", name: "Requester User", role: "REQUESTER", passwordHash, isActive: true },
    });

    const safetyOfficer = await prisma.user.create({
      data: { email: "safety@md.test", name: "Safety Officer", role: "SAFETY_OFFICER", passwordHash, isActive: true },
    });

    const areaOwner = await prisma.user.create({
      data: { email: "areaowner@md.test", name: "Area Owner", role: "AREA_OWNER", passwordHash, isActive: true },
    });
    areaOwnerId = areaOwner.id;

    const inactiveUser = await prisma.user.create({
      data: { email: "inactive@md.test", name: "Inactive User", role: "AREA_OWNER", passwordHash, isActive: false },
    });
    inactiveUserId = inactiveUser.id;

    // Seed baseline plant + area + equipment for read tests
    const plant = await prisma.plant.create({
      data: { code: "BASE-PLANT-01", name: "Base Test Plant", timezone: "Asia/Kolkata" },
    });
    plantId = plant.id;

    const area = await prisma.area.create({
      data: { plantId: plant.id, code: "BASE-AREA", name: "Base Test Area", ownerId: areaOwnerId },
    });
    areaId = area.id;

    const equipment = await prisma.equipment.create({
      data: { areaId: area.id, tagNumber: "BASE-TAG-001", name: "Base Test Equipment", criticality: "MEDIUM" },
    });
    equipmentId = equipment.id;

    // Obtain REAL JWT tokens via the login route (consistent with server-side verification key)
    adminToken = await loginAndGetToken("admin@md.test", RAW_PASSWORD);
    requesterToken = await loginAndGetToken("requester@md.test", RAW_PASSWORD);
    safetyOfficerToken = await loginAndGetToken("safety@md.test", RAW_PASSWORD);
    areaOwnerToken = await loginAndGetToken("areaowner@md.test", RAW_PASSWORD);
  }, 90000);

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (pgServer) {
      try { await pgServer.stop(); } catch {}
    }
  }, 30000);

  // ----- Plant Tests -----

  it("1. GET /api/plants — authenticated user receives plant list", async () => {
    const req = makeRequest("/api/plants", { token: adminToken });
    const res = await getPlantsHandler(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("data");
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body).toHaveProperty("total");
  });

  it("2. GET /api/plants — unauthenticated returns 401", async () => {
    const req = makeRequest("/api/plants"); // No token
    const res = await getPlantsHandler(req);
    expect(res.status).toBe(401);
  });

  it("3. POST /api/plants — ADMIN creates a plant successfully", async () => {
    const req = makeRequest("/api/plants", {
      method: "POST",
      token: adminToken,
      body: { code: "NEW-PLANT-01", name: "New Test Plant", timezone: "UTC" },
    });
    const res = await postPlantsHandler(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.code).toBe("NEW-PLANT-01");
    expect(body.data.name).toBe("New Test Plant");
    expect(body.data.timezone).toBe("UTC");
  });

  it("4. POST /api/plants — REQUESTER is forbidden (403)", async () => {
    const req = makeRequest("/api/plants", {
      method: "POST",
      token: requesterToken,
      body: { code: "FORBID-PLANT", name: "Forbidden Plant" },
    });
    const res = await postPlantsHandler(req);
    expect(res.status).toBe(403);
  });

  it("5. POST /api/plants — duplicate code returns 409", async () => {
    const req = makeRequest("/api/plants", {
      method: "POST",
      token: adminToken,
      body: { code: "NEW-PLANT-01", name: "Duplicate Plant" }, // Same code as test 3
    });
    const res = await postPlantsHandler(req);
    expect(res.status).toBe(409);
  });

  it("6. SAFETY_OFFICER is forbidden from creating plants (403)", async () => {
    const req = makeRequest("/api/plants", {
      method: "POST",
      token: safetyOfficerToken,
      body: { code: "SO-PLANT", name: "Safety Officer Plant" },
    });
    const res = await postPlantsHandler(req);
    expect(res.status).toBe(403);
  });

  it("6b. PATCH /api/plants/:id — ADMIN can update a plant name", async () => {
    const req = makeRequest(`/api/plants/${plantId}`, {
      method: "PATCH",
      token: adminToken,
      body: { name: "Updated Plant Name" },
    });
    const res = await patchPlantHandler(req, { params: Promise.resolve({ id: plantId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe("Updated Plant Name");
    // code must be unchanged (immutable)
    expect(body.data.code).toBe("BASE-PLANT-01");
  });

  it("6c. GET /api/plants/:id — returns single plant by id", async () => {
    const req = makeRequest(`/api/plants/${plantId}`, { token: adminToken });
    const res = await getPlantByIdHandler(req, { params: Promise.resolve({ id: plantId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(plantId);
  });

  // ----- Area Tests -----

  it("7. GET /api/areas — authenticated user receives area list", async () => {
    const req = makeRequest("/api/areas", { token: adminToken });
    const res = await getAreasHandler(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  it("7b. GET /api/areas — unauthenticated returns 401", async () => {
    const req = makeRequest("/api/areas");
    const res = await getAreasHandler(req);
    expect(res.status).toBe(401);
  });

  it("8. GET /api/areas?plantId= — filters by plantId correctly", async () => {
    const req = makeRequest(`/api/areas?plantId=${plantId}`, { token: adminToken });
    const res = await getAreasHandler(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.every((a: { plantId: string }) => a.plantId === plantId)).toBe(true);
  });

  it("9. POST /api/areas — ADMIN creates area with valid plantId and ownerId", async () => {
    const req = makeRequest("/api/areas", {
      method: "POST",
      token: adminToken,
      body: { plantId, code: "NEW-AREA-01", name: "New Test Area", ownerId: areaOwnerId },
    });
    const res = await postAreasHandler(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.plantId).toBe(plantId);
    expect(body.data.ownerId).toBe(areaOwnerId);
    expect(body.data.plant).toBeDefined();
    expect(body.data.owner).toBeDefined();
  });

  it("10. POST /api/areas — invalid plantId returns 400", async () => {
    const req = makeRequest("/api/areas", {
      method: "POST",
      token: adminToken,
      body: { plantId: "non-existent-plant-id", code: "ORPHAN", name: "Orphan Area", ownerId: areaOwnerId },
    });
    const res = await postAreasHandler(req);
    expect(res.status).toBe(400);
  });

  it("11. POST /api/areas — inactive ownerId returns 400", async () => {
    const req = makeRequest("/api/areas", {
      method: "POST",
      token: adminToken,
      body: { plantId, code: "INACTIVE-OWNER-AREA", name: "Inactive Owner Area", ownerId: inactiveUserId },
    });
    const res = await postAreasHandler(req);
    expect(res.status).toBe(400);
  });

  it("12. POST /api/areas — AREA_OWNER is forbidden (403)", async () => {
    const req = makeRequest("/api/areas", {
      method: "POST",
      token: areaOwnerToken,
      body: { plantId, code: "AO-AREA", name: "Area Owner Area", ownerId: areaOwnerId },
    });
    const res = await postAreasHandler(req);
    expect(res.status).toBe(403);
  });

  it("13. GET /api/areas/:id — returns area with embedded plant and owner", async () => {
    const req = makeRequest(`/api/areas/${areaId}`, { token: adminToken });
    const res = await getAreaByIdHandler(req, { params: Promise.resolve({ id: areaId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(areaId);
    expect(body.data.plant).toBeDefined();
    expect(body.data.plant.id).toBe(plantId);
    expect(body.data.owner).toBeDefined();
  });

  // ----- Equipment Tests -----

  it("14. GET /api/equipment — authenticated user receives equipment list", async () => {
    const req = makeRequest("/api/equipment", { token: adminToken });
    const res = await getEquipmentHandler(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  it("14b. GET /api/equipment — unauthenticated returns 401", async () => {
    const req = makeRequest("/api/equipment");
    const res = await getEquipmentHandler(req);
    expect(res.status).toBe(401);
  });

  it("15. POST /api/equipment — ADMIN creates equipment with valid areaId", async () => {
    const req = makeRequest("/api/equipment", {
      method: "POST",
      token: adminToken,
      body: { areaId, tagNumber: "NEW-EQ-001", name: "New Test Equipment", criticality: "HIGH" },
    });
    const res = await postEquipmentHandler(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.areaId).toBe(areaId);
    expect(body.data.area).toBeDefined();
    expect(body.data.area.plant).toBeDefined();
  });

  it("16. POST /api/equipment — invalid areaId returns 400", async () => {
    const req = makeRequest("/api/equipment", {
      method: "POST",
      token: adminToken,
      body: { areaId: "non-existent-area-id", tagNumber: "ORPHAN-EQ-001", name: "Orphan Equipment" },
    });
    const res = await postEquipmentHandler(req);
    expect(res.status).toBe(400);
  });

  it("17. POST /api/equipment — duplicate tagNumber returns 409", async () => {
    const req = makeRequest("/api/equipment", {
      method: "POST",
      token: adminToken,
      body: { areaId, tagNumber: "BASE-TAG-001", name: "Duplicate Equipment" }, // Same tag as seeded
    });
    const res = await postEquipmentHandler(req);
    expect(res.status).toBe(409);
  });

  it("17b. POST /api/equipment — AREA_OWNER is forbidden (403)", async () => {
    const req = makeRequest("/api/equipment", {
      method: "POST",
      token: areaOwnerToken,
      body: { areaId, tagNumber: "AO-EQ-001", name: "AO Equipment" },
    });
    const res = await postEquipmentHandler(req);
    expect(res.status).toBe(403);
  });

  it("17c. GET /api/equipment?areaId= — filters by areaId correctly", async () => {
    const req = makeRequest(`/api/equipment?areaId=${areaId}`, { token: adminToken });
    const res = await getEquipmentHandler(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data.every((e: { areaId: string }) => e.areaId === areaId)).toBe(true);
  });

  it("17d. GET /api/equipment?plantId= — resolves Equipment→Area→Plant (no plantId on Equipment)", async () => {
    const req = makeRequest(`/api/equipment?plantId=${plantId}`, { token: adminToken });
    const res = await getEquipmentHandler(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    // All returned equipment must belong to the correct plant via their area relation
    expect(body.data.every((e: { area: { plantId: string } }) => e.area.plantId === plantId)).toBe(true);
  });

  it("17e. GET /api/equipment/:id — returns equipment with area and plant derived via relations", async () => {
    const req = makeRequest(`/api/equipment/${equipmentId}`, { token: adminToken });
    const res = await getEquipmentByIdHandler(req, { params: Promise.resolve({ id: equipmentId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(equipmentId);
    expect(body.data.area).toBeDefined();
    expect(body.data.area.plant).toBeDefined();
    expect(body.data.area.plantId).toBe(plantId);
    // Confirm no direct plantId field exists on Equipment (hierarchy enforced)
    expect(body.data.plantId).toBeUndefined();
  });
});
