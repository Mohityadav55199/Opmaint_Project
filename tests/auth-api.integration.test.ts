import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import fs from "fs";
import EmbeddedPostgres from "embedded-postgres";
import { Role } from "@prisma/client";
import { SignJWT } from "jose";
import { hashPassword, getJwtSecret, AUTH_COOKIE_NAME } from "../src/lib/auth";
import { prisma, resetPrismaClient } from "../src/lib/prisma";
import { POST as loginHandler } from "../src/app/api/auth/login/route";
import { GET as meHandler } from "../src/app/api/auth/me/route";
import { POST as logoutHandler } from "../src/app/api/auth/logout/route";

const DB_PORT = 54329;
const DB_NAME = "opmaint_auth_test";
const TEST_DATABASE_URL = `postgresql://postgres:password@localhost:${DB_PORT}/${DB_NAME}?schema=public`;

describe("Authentication & Session API Integration (PostgreSQL)", { timeout: 30000 }, () => {
  let pgServer: EmbeddedPostgres;

  let activeUserId: string;
  const activeUserEmail = "engineer.active@opmaint.local";
  const inactiveUserEmail = "contractor.inactive@opmaint.local";
  const rawPassword = "CorrectPassword123!";

  beforeAll(async () => {
    // 0. Kill any lingering process listening on DB_PORT
    try {
      execSync(
        `powershell -Command "Get-NetTCPConnection -LocalPort ${DB_PORT} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`,
        { stdio: "ignore" }
      );
    } catch {}

    const isAlreadyInitialized = fs.existsSync(".embedded-pg-auth-data/PG_VERSION");
    if (!isAlreadyInitialized && fs.existsSync(".embedded-pg-auth-data")) {
      try {
        fs.rmSync(".embedded-pg-auth-data", { recursive: true, force: true });
      } catch {}
    }

    // 1. Start embedded PostgreSQL
    pgServer = new EmbeddedPostgres({
      port: DB_PORT,
      databaseDir: ".embedded-pg-auth-data",
      user: "postgres",
      password: "password",
      persistent: true,
      onLog: () => {},
      onError: () => {},
    });

    if (!fs.existsSync(".embedded-pg-auth-data/PG_VERSION")) {
      await pgServer.initialise();
    }
    await pgServer.start();

    try {
      await pgServer.dropDatabase(DB_NAME);
    } catch {}
    await pgServer.createDatabase(DB_NAME);

    // 2. Set DATABASE_URL, reset Prisma cache, and run Prisma migration
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    resetPrismaClient();

    execSync("npx prisma migrate deploy", {
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      stdio: "pipe",
    });

    // 3. Connect Prisma client
    await prisma.$connect();

    // 4. Seed test users
    const passwordHash = await hashPassword(rawPassword);

    const activeUser = await prisma.user.create({
      data: {
        email: activeUserEmail,
        name: "Active Test Engineer",
        passwordHash,
        role: Role.REQUESTER,
        isActive: true,
      },
    });
    activeUserId = activeUser.id;

    await prisma.user.create({
      data: {
        email: inactiveUserEmail,
        name: "Deactivated Contractor",
        passwordHash,
        role: Role.REQUESTER,
        isActive: false,
      },
    });
  }, 180000);

  afterAll(async () => {
    try {
      if (prisma) await prisma.$disconnect();
      if (pgServer) await pgServer.stop();
    } catch {}
  });

  // -------------------------------------------------------------
  // 1. Successful Login
  // -------------------------------------------------------------
  it("1. successful login sets HTTP-only cookie and returns safe user data", async () => {
    const req = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: activeUserEmail,
        password: rawPassword,
      }),
    });

    const res = await loginHandler(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.user).toBeDefined();
    expect(data.user.id).toBe(activeUserId);
    expect(data.user.email).toBe(activeUserEmail);
    expect(data.user.name).toBe("Active Test Engineer");
    expect(data.user.role).toBe("REQUESTER");

    // Check HTTP-only cookie
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain(`${AUTH_COOKIE_NAME}=`);
    expect(setCookie?.toLowerCase()).toContain("httponly");
    expect(setCookie?.toLowerCase()).toContain("samesite=lax");
    expect(setCookie?.toLowerCase()).toContain("path=/");
  });

  // -------------------------------------------------------------
  // 2. Wrong Password
  // -------------------------------------------------------------
  it("2. wrong password rejected with generic authentication error (401)", async () => {
    const req = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: activeUserEmail,
        password: "wrong-password",
      }),
    });

    const res = await loginHandler(req);
    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data.code).toBe("UNAUTHORIZED");
    expect(data.message).toBe("Invalid email or password");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  // -------------------------------------------------------------
  // 3. Unknown Email
  // -------------------------------------------------------------
  it("3. unknown email rejected with same generic error without leaking existence (401)", async () => {
    const req = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "nonexistent.user@opmaint.local",
        password: rawPassword,
      }),
    });

    const res = await loginHandler(req);
    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data.code).toBe("UNAUTHORIZED");
    expect(data.message).toBe("Invalid email or password");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  // -------------------------------------------------------------
  // 4. Inactive User
  // -------------------------------------------------------------
  it("4. inactive / deactivated user is rejected", async () => {
    const req = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: inactiveUserEmail,
        password: rawPassword,
      }),
    });

    const res = await loginHandler(req);
    expect([401, 403]).toContain(res.status);

    const data = await res.json();
    expect(data.message).toMatch(/deactivated|invalid/i);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  // -------------------------------------------------------------
  // 5. Malformed Login Payload
  // -------------------------------------------------------------
  it("5. malformed login payload rejected with 422 validation error", async () => {
    const req = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "invalid-email-format",
        // missing password
      }),
    });

    const res = await loginHandler(req);
    expect(res.status).toBe(422);

    const data = await res.json();
    expect(data.code).toBe("VALIDATION_ERROR");
  });

  // -------------------------------------------------------------
  // 6. Successful /me
  // -------------------------------------------------------------
  it("6. successful /me with valid cookie returns authoritative user data", async () => {
    // Perform login first to acquire genuine cookie
    const loginReq = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: activeUserEmail,
        password: rawPassword,
      }),
    });
    const loginRes = await loginHandler(loginReq);
    const setCookie = loginRes.headers.get("set-cookie") || "";
    const tokenMatch = setCookie.match(new RegExp(`${AUTH_COOKIE_NAME}=([^;]+)`));
    const token = tokenMatch ? tokenMatch[1] : "";
    expect(token).toBeTruthy();

    // Call /me with cookie
    const meReq = new Request("http://localhost:3000/api/auth/me", {
      method: "GET",
      headers: {
        cookie: `${AUTH_COOKIE_NAME}=${token}`,
      },
    });

    const meRes = await meHandler(meReq);
    expect(meRes.status).toBe(200);

    const meData = await meRes.json();
    expect(meData.user).toBeDefined();
    expect(meData.user.id).toBe(activeUserId);
    expect(meData.user.email).toBe(activeUserEmail);
    expect(meData.user.role).toBe("REQUESTER");
  });

  // -------------------------------------------------------------
  // 7. Missing Authentication Cookie
  // -------------------------------------------------------------
  it("7. missing authentication cookie returns 401 Unauthorized", async () => {
    const meReq = new Request("http://localhost:3000/api/auth/me", {
      method: "GET",
    });

    const meRes = await meHandler(meReq);
    expect(meRes.status).toBe(401);

    const data = await meRes.json();
    expect(data.code).toBe("UNAUTHORIZED");
  });

  // -------------------------------------------------------------
  // 8. Invalid JWT
  // -------------------------------------------------------------
  it("8. invalid / forged JWT returns 401 Unauthorized", async () => {
    // Forged token signed with a bogus secret
    const bogusSecret = new TextEncoder().encode("bogus-forged-secret-key-32-chars-long");
    const forgedToken = await new SignJWT({ sub: activeUserId })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("8h")
      .sign(bogusSecret);

    const meReq = new Request("http://localhost:3000/api/auth/me", {
      method: "GET",
      headers: {
        cookie: `${AUTH_COOKIE_NAME}=${forgedToken}`,
      },
    });

    const meRes = await meHandler(meReq);
    expect(meRes.status).toBe(401);

    const data = await meRes.json();
    expect(data.code).toBe("UNAUTHORIZED");
  });

  // -------------------------------------------------------------
  // 9. Expired JWT
  // -------------------------------------------------------------
  it("9. expired JWT returns 401 Unauthorized", async () => {
    const realSecret = getJwtSecret();
    const expiredToken = await new SignJWT({ sub: activeUserId })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 10) // Expired 10s ago
      .sign(realSecret);

    const meReq = new Request("http://localhost:3000/api/auth/me", {
      method: "GET",
      headers: {
        cookie: `${AUTH_COOKIE_NAME}=${expiredToken}`,
      },
    });

    const meRes = await meHandler(meReq);
    expect(meRes.status).toBe(401);

    const data = await meRes.json();
    expect(data.code).toBe("UNAUTHORIZED");
  });

  // -------------------------------------------------------------
  // 10. Stale JWT Role vs Database Role
  // -------------------------------------------------------------
  it("10. database role is authoritative over stale JWT claim", async () => {
    // Create token for active user
    const realSecret = getJwtSecret();
    const token = await new SignJWT({ sub: activeUserId, role: "REQUESTER" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("8h")
      .sign(realSecret);

    // Promote user in PostgreSQL database to SAFETY_OFFICER
    await prisma.user.update({
      where: { id: activeUserId },
      data: { role: Role.SAFETY_OFFICER },
    });

    try {
      const meReq = new Request("http://localhost:3000/api/auth/me", {
        method: "GET",
        headers: {
          cookie: `${AUTH_COOKIE_NAME}=${token}`,
        },
      });

      const meRes = await meHandler(meReq);
      expect(meRes.status).toBe(200);

      const meData = await meRes.json();
      // Must reflect authoritative database promotion, NOT the token claim
      expect(meData.user.role).toBe("SAFETY_OFFICER");
    } finally {
      // Restore back to REQUESTER
      await prisma.user.update({
        where: { id: activeUserId },
        data: { role: Role.REQUESTER },
      });
    }
  });

  // -------------------------------------------------------------
  // 11. Logout
  // -------------------------------------------------------------
  it("11. logout clears the session cookie and returns success", async () => {
    const logoutRes = await logoutHandler();
    expect(logoutRes.status).toBe(200);

    const data = await logoutRes.json();
    expect(data.success).toBe(true);
    expect(data.message).toBe("Logged out successfully");

    const setCookie = logoutRes.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    // Cookie must be cleared with empty value and max-age=0 or expired date
    expect(setCookie).toContain(`${AUTH_COOKIE_NAME}=;`);
    expect(setCookie?.toLowerCase()).toContain("max-age=0");
  });

  // -------------------------------------------------------------
  // 12. Password Hash Never Appears in Response
  // -------------------------------------------------------------
  it("12. password hash and JWT secrets never leak in responses", async () => {
    const loginReq = new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: activeUserEmail,
        password: rawPassword,
      }),
    });

    const loginRes = await loginHandler(loginReq);
    const rawText = await loginRes.text();

    expect(rawText).not.toContain("passwordHash");
    expect(rawText).not.toContain(rawPassword);
    expect(rawText).not.toContain("$2a$");
    expect(rawText).not.toContain("$2b$");
    expect(rawText).not.toContain(process.env.JWT_SECRET || "SUPER_SECRET_NEVER_LEAK");

    const userObj = JSON.parse(rawText).user;
    expect(Object.keys(userObj).sort()).toEqual(["email", "id", "name", "role"].sort());
  });
});
