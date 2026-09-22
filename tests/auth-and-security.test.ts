import { describe, it, expect } from "vitest";
import { signToken, verifyJwt, getAuthenticatedUser } from "../src/lib/auth";
import { checkAction } from "../src/domain/state-machine/authorization";
import { PermitData } from "../src/domain/types";

describe("JWT Authentication & User Deactivation Security", () => {
  const REAL_SECRET = "production-grade-random-secret-key-for-testing-12345";
  const FALLBACK_SECRET = "opmaint-ptw-super-secret-jwt-key-for-signing-tokens-min-32-chars";

  it("rejects tokens signed with the fallback/example secret when configured with a real secret", async () => {
    // Attacker signs token using public fallback secret
    const forgedToken = await signToken(
      { id: "attacker_1", name: "Malicious User", role: "ADMIN" },
      FALLBACK_SECRET
    );

    // Application verifying with its real secret
    const payload = await verifyJwt(forgedToken, REAL_SECRET);
    expect(payload).toBeNull();
  });

  it("accepts tokens signed with the genuine configured secret", async () => {
    const validToken = await signToken(
      { id: "user_valid", name: "Genuine User", role: "SAFETY_OFFICER" },
      REAL_SECRET
    );

    const payload = await verifyJwt(validToken, REAL_SECRET);
    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe("user_valid");
  });

  it("derives authorization from the authoritative database role, NOT the JWT claim", async () => {
    // User was originally issued a token when they were a REQUESTER
    const tokenClaimingRequester = await signToken(
      { id: "user_promoted", name: "Promoted Staff", role: "REQUESTER" },
      REAL_SECRET
    );

    // Mock DB loader returning the authoritative upgraded role from PostgreSQL:
    const mockDbUser = {
      id: "user_promoted",
      name: "Promoted Staff",
      email: "promoted@opmaint.local",
      role: "SAFETY_OFFICER" as const, // Promoted in DB!
      isActive: true,
    };

    const authenticatedUser = await getAuthenticatedUser(
      tokenClaimingRequester,
      async (id) => (id === "user_promoted" ? mockDbUser : null),
      REAL_SECRET
    );

    expect(authenticatedUser).not.toBeNull();
    expect(authenticatedUser?.role).toBe("SAFETY_OFFICER"); // Uses DB role!

    // Verify that authorization engine respects this DB-backed role
    const activePermit: PermitData = {
      id: "permit_active_01",
      permitSequence: 1,
      permitNumber: "PTW-2026-0001",
      status: "ACTIVE",
      type: "HOT_WORK",
      requesterId: "other_user",
      contractorTeam: "Team A",
      workDescription: "Welding",
      equipmentId: "eq_1",
      plannedStartTime: new Date(),
      plannedEndTime: new Date(Date.now() + 3600000),
      expiresAt: new Date(Date.now() + 3600000),
      hazards: ["HOT_SURFACES"],
      ppeRequired: ["HELMET"],
      precautionsChecklist: {},
      typeData: {},
      approvalRound: 1,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // A requester cannot SUSPEND an active permit, but a SAFETY_OFFICER can!
    const check = checkAction(activePermit, authenticatedUser!, "SUSPEND");
    expect(check.allowed).toBe(true);
  });

  it("rejects deactivated users even if they present a valid unexpired JWT", async () => {
    const token = await signToken(
      { id: "user_fired", name: "Fired Contractor", role: "REQUESTER" },
      REAL_SECRET
    );

    // Mock DB loader returning isActive: false
    const deactivatedDbUser = {
      id: "user_fired",
      name: "Fired Contractor",
      email: "fired@opmaint.local",
      role: "REQUESTER" as const,
      isActive: false, // DEACTIVATED!
    };

    const authenticatedUser = await getAuthenticatedUser(
      token,
      async (id) => (id === "user_fired" ? deactivatedDbUser : null),
      REAL_SECRET
    );

    expect(authenticatedUser).toBeNull();
  });
});
