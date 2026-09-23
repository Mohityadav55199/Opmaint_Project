# Opmaint — Permit to Work (PTW) System

An enterprise-grade, full-stack **Permit-to-Work (PTW)** management platform for industrial manufacturing facilities. Built with **Next.js 16 (App Router)**, **TypeScript**, **PostgreSQL**, and **Prisma**.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture](#2-architecture)
3. [Permit Lifecycle & State Machine](#3-permit-lifecycle--state-machine)
4. [Role-Based Authorization](#4-role-based-authorization)
5. [Approval Slot Mechanics](#5-approval-slot-mechanics)
6. [Installation & Local Development](#6-installation--local-development)
7. [Demo Accounts](#7-demo-accounts)
8. [API Reference](#8-api-reference)
9. [Testing](#9-testing)
10. [End-to-End Workflow Walkthrough](#10-end-to-end-workflow-walkthrough)
11. [AI Usage Disclosure](#11-ai-usage-disclosure)

---

## 1. System Overview

The Opmaint PTW module enforces that hazardous work in industrial facilities can only proceed after a formal, multi-stakeholder authorization chain has been completed. Each permit-to-work passes through the following phases:

- **Creation**: A Requester drafts a permit against a specific piece of equipment.
- **Multi-Role Approval**: A Safety Officer and the equipment's Area Owner must independently review and approve.
- **Activation**: Once fully approved, any authorized role can activate the permit, starting the validity timer.
- **Operational Lifecycle**: While ACTIVE, work logs and (for confined spaces) entry/exit logs are recorded.
- **Closure & Verification**: The requester closes the permit; a Safety Officer independently verifies the physical site.

---

## 2. Architecture

```
src/
├── app/
│   ├── api/                        # Next.js Route Handlers (backend)
│   │   ├── auth/                   # Login, logout, session
│   │   ├── permits/                # CRUD + workflow actions
│   │   │   └── [id]/
│   │   │       ├── actions/        # GET available actions per user
│   │   │       ├── approve/        # POST — approval slot fulfillment
│   │   │       ├── reject/         # POST
│   │   │       ├── activate/       # POST
│   │   │       ├── suspend/        # POST
│   │   │       ├── resume/         # POST
│   │   │       ├── cancel/         # POST
│   │   │       ├── close/          # POST
│   │   │       ├── verify-closure/ # POST
│   │   │       ├── work-logs/      # GET/POST
│   │   │       └── entry-logs/     # GET/POST (confined space)
│   │   ├── dashboard/              # Aggregated dashboard endpoint
│   │   ├── plants/                 # Master data
│   │   ├── areas/                  # Master data
│   │   └── equipment/              # Master data
│   ├── dashboard/                  # Dashboard page
│   ├── permits/                    # Permit list, detail, creation, edit
│   └── login/                      # Authentication page
├── components/                     # Reusable UI components
├── domain/                         # Core business logic (pure, testable)
│   ├── state-machine/              # checkAction(), getNextStatus()
│   ├── approvals/                  # Slot evaluation, eligibility
│   ├── expiry.ts                   # Expiry detection
│   ├── audit.ts                    # Audit log building
│   └── permit-registry.ts          # Permit-type specific validation
├── lib/                            # Application-layer services
│   ├── permit-service.ts           # Orchestrates all permit operations
│   ├── auth.ts                     # JWT cookie auth middleware
│   ├── errors.ts                   # Typed error classes
│   └── prisma.ts                   # Prisma singleton
└── prisma/
    ├── schema.prisma               # Full database schema
    └── seed.ts                     # Demo data seeding
```

### Key Design Decisions

- **Domain layer is pure**: All authorization and state-transition logic in `src/domain/` has zero database or framework dependencies — making it fully unit-testable.
- **Backend is the authorization source of truth**: The frontend never makes access-control decisions. It calls `GET /api/permits/:id/actions` to discover what buttons to show.
- **Transactional audit trail**: Every state mutation (approve, activate, close, etc.) writes an `AuditLog` record within the same database transaction, guaranteeing an immutable, verifiable history.
- **Row-level locking**: Concurrent approval and state mutations use `SELECT FOR UPDATE` to prevent race conditions.

---

## 3. Permit Lifecycle & State Machine

```
                    ┌──────────────────────────────────────────────────────┐
                    │                    PERMIT LIFECYCLE                  │
                    └──────────────────────────────────────────────────────┘

  [Create]                [Submit]            [All Slots Approved]
   DRAFT ──────────────► PENDING_APPROVAL ──────────────────────► APPROVED
     │                        │                                      │
     │              [Any Slot REJECTED]                       [ACTIVATE]
     │                        ▼                                      │
     │                    REJECTED                                   ▼
     │                                                           ACTIVE ◄─────┐
     │                                                               │         │
     │                                                       [SUSPEND]         │
     │                                                               ▼         │
     │                                                          SUSPENDED      │
     │                                                               │         │
     │                                                       [RESUME] ─────────┘
     │
  ACTIVE ──────────────────────────────────────────────────────────────────────►
                │               │                │
        [Expiry timer]   [CLOSE by requester]  [CANCEL]
                │               │                │
            EXPIRED          CLOSED         CANCELLED
                                │
                      [VERIFY_CLOSURE by Safety Officer]
                                │
                          CLOSED_VERIFIED
```

### State Transitions

| From               | Action         | To                 | Who Can Perform         |
|--------------------|----------------|--------------------|-------------------------|
| DRAFT              | SUBMIT         | PENDING_APPROVAL   | REQUESTER (owner)       |
| PENDING_APPROVAL   | APPROVE        | PENDING_APPROVAL*  | AREA_OWNER / SAFETY_OFFICER |
| PENDING_APPROVAL   | REJECT         | REJECTED           | AREA_OWNER / SAFETY_OFFICER |
| APPROVED           | ACTIVATE       | ACTIVE             | SAFETY_OFFICER / ADMIN  |
| ACTIVE             | SUSPEND        | SUSPENDED          | SAFETY_OFFICER / ADMIN  |
| ACTIVE             | CLOSE          | CLOSED             | REQUESTER (owner)       |
| ACTIVE (expired)   | System         | EXPIRED            | System (automatic)      |
| SUSPENDED          | RESUME         | ACTIVE             | SAFETY_OFFICER / ADMIN  |
| CLOSED             | VERIFY_CLOSURE | CLOSED_VERIFIED    | SAFETY_OFFICER (not closer) |
| Any non-terminal   | CANCEL         | CANCELLED          | REQUESTER (owner) / ADMIN |

\* Once both slots (AREA_OWNER + SAFETY_OFFICER) are approved, status automatically transitions to APPROVED.

---

## 4. Role-Based Authorization

| Role             | Capabilities |
|------------------|--------------|
| `REQUESTER`      | Create/edit DRAFT permits, submit for approval, close own ACTIVE permits, cancel own permits (DRAFT/PENDING), log work on ACTIVE permits |
| `AREA_OWNER`     | Approve/reject permits where equipment is in their owned area |
| `SAFETY_OFFICER` | Approve/reject any permit, activate APPROVED permits, suspend/resume ACTIVE permits, verify closure of CLOSED permits |
| `ADMIN`          | All capabilities except self-approval of own permits |

### Self-Approval Prevention

No user may approve their own permit under any role, including `ADMIN`. The authorization engine enforces this at the domain level.

---

## 5. Approval Slot Mechanics

When a permit is submitted, the system initializes **two approval slots**:

1. `SAFETY_OFFICER` — filled by any user with `SAFETY_OFFICER` role
2. `AREA_OWNER` — filled by the user whose `id` matches `equipment.area.ownerId`

Both slots must be satisfied (in any order) before the status can become `APPROVED`.

**Self-approval rule**: The permit requester cannot fulfil any approval slot, even if they hold the qualifying role.

**Rejection rule**: A single rejection by any authorized approver immediately moves the permit to `REJECTED` without requiring the other slot.

---

## 6. Installation & Local Development

### Prerequisites

- Node.js 20+
- PostgreSQL 14+ running locally or via Docker
- `npm` or `pnpm`

### Steps

```bash
# 1. Clone and install
git clone https://github.com/your-org/opmaint
cd opmaint
npm install

# 2. Set up environment variables
cp .env.example .env
# Edit .env with your DATABASE_URL and JWT_SECRET

# 3. Apply database migrations
npx prisma migrate deploy

# 4. Seed the database with demo data
npx prisma db seed

# 5. Start the development server
npm run dev
```

The app will be available at `http://localhost:3000`.

### Environment Variables

| Variable            | Description                                   | Example                                                     |
|---------------------|-----------------------------------------------|-------------------------------------------------------------|
| `DATABASE_URL`      | PostgreSQL connection string                  | `postgresql://user:pass@localhost:5432/opmaint?schema=public` |
| `JWT_SECRET`        | 32+ character secret key for JWT HMAC signing | `your-secure-random-secret-at-least-32-chars`               |
| `NODE_ENV`          | Environment identifier                        | `development` / `production` / `test`                       |

> **Security Note**: In production (`NODE_ENV=production`), the application halts startup if `JWT_SECRET` is missing or matches any default placeholder value.

---

## 7. Demo Accounts

All demo accounts use the password: **`password123`**

| Email                          | Name                            | Role             | Notes                                      |
|--------------------------------|---------------------------------|------------------|--------------------------------------------|
| `admin@opmaint.local`          | Rajesh Kumar (Plant Head)       | `ADMIN`          | Full system access                         |
| `safety.officer@opmaint.local` | Priya Sharma (Safety Officer)   | `SAFETY_OFFICER` | Can approve, activate, suspend, verify     |
| `ao.press@opmaint.local`       | Venkat Iyer (Press Shop Owner)  | `AREA_OWNER`     | Owns the Press Shop area                   |
| `ao.weld@opmaint.local`        | Lakshmi Nair (Weld Bay Owner)   | `AREA_OWNER`     | Owns the Weld Bay and Paint Booth areas    |
| `requester@opmaint.local`      | Sunil Verma (Maintenance Lead)  | `REQUESTER`      | Creates and manages own permits            |

### Demo Plant & Area Structure

- **Plant**: `PLANT-01` — Bangalore Manufacturing Unit
  - **Press Shop** (Area Owner: `ao.press@opmaint.local`)
    - `PRS-PRESS-01` — Hydraulic Press Machine
    - `PRS-WELD-01` — MIG Welding Station A
  - **Weld Bay** (Area Owner: `ao.weld@opmaint.local`)
    - `WBY-WELD-01` — TIG Welding Bay
    - `WBY-TANK-01` — Solvent Storage Tank (Confined Space)
  - **Paint Booth** (Area Owner: `ao.weld@opmaint.local`)
    - `PNT-BOOTH-01` — Electrostatic Paint Booth
    - `PNT-COMP-01` — Air Compressor Unit

---

## 8. API Reference

### Authentication

| Method | Path              | Description                           |
|--------|-------------------|---------------------------------------|
| POST   | `/api/auth/login`  | Authenticate and receive session cookie |
| GET    | `/api/auth/me`     | Get current user from session         |
| POST   | `/api/auth/logout` | Invalidate session cookie             |

### Master Data

| Method | Path               | Description                |
|--------|--------------------|----------------------------|
| GET    | `/api/plants`      | List all plants            |
| GET    | `/api/areas`       | List areas (filterable by `plantId`) |
| GET    | `/api/equipment`   | List equipment (filterable by `areaId`) |

### Permits

| Method | Path                               | Description                            |
|--------|------------------------------------|----------------------------------------|
| GET    | `/api/permits`                     | List permits (filterable, paginated)   |
| POST   | `/api/permits`                     | Create new DRAFT permit                |
| GET    | `/api/permits/:id`                 | Get full permit detail                 |
| PATCH  | `/api/permits/:id`                 | Update DRAFT permit fields             |
| GET    | `/api/permits/:id/actions`         | Get authorized actions for current user|
| POST   | `/api/permits/:id/submit`          | Submit DRAFT for approval              |
| POST   | `/api/permits/:id/approve`         | Approve an approval slot               |
| POST   | `/api/permits/:id/reject`          | Reject with reason                     |
| POST   | `/api/permits/:id/activate`        | Activate APPROVED permit               |
| POST   | `/api/permits/:id/suspend`         | Suspend ACTIVE permit                  |
| POST   | `/api/permits/:id/resume`          | Resume SUSPENDED permit                |
| POST   | `/api/permits/:id/cancel`          | Cancel permit (permanent)              |
| POST   | `/api/permits/:id/close`           | Close with completion notes            |
| POST   | `/api/permits/:id/verify-closure`  | Safety Officer closure verification    |
| GET    | `/api/permits/:id/work-logs`       | List work logs                         |
| POST   | `/api/permits/:id/work-logs`       | Add work log (ACTIVE only)             |
| GET    | `/api/permits/:id/entry-logs`      | List entry/exit logs                   |
| POST   | `/api/permits/:id/entry-logs`      | Add entry/exit log (ACTIVE CS permits) |

### Dashboard

| Method | Path             | Description                                           |
|--------|------------------|-------------------------------------------------------|
| GET    | `/api/dashboard` | Operational overview: permits, KPIs, expiring, approvals |

---

## 9. Testing

```bash
# Unit tests (100 tests — pure domain logic, zero DB)
npm run test:unit

# PostgreSQL integration tests (127 tests — real DB required)
npm run test:integration

# TypeScript typecheck
npm run typecheck

# ESLint (0 errors, 0 warnings)
npm run lint

# Production build
npm run build
```

### Test Coverage Areas

| Test Suite                              | Tests | Scope |
|-----------------------------------------|-------|-------|
| `payload-validation.test.ts`            | 19    | Input schema validation, banned fields |
| `submit-and-validity.test.ts`           | 17    | Submission business rules, field requirements |
| `authorization-and-slots.test.ts`       | 31    | Role checks, slot evaluation, self-approval prevention |
| `state-machine.test.ts`                 | 10    | State transitions, preconditions |
| `expiry-and-conflict.test.ts`           | 13    | Expiry detection, concurrent modification |
| `permit-registry-extensibility.test.ts` | 6     | Type-specific field validation |
| `auth-and-security.test.ts`             | 4     | Authentication guards |
| Integration suites (7 files)            | 127   | Real PostgreSQL: CRUD, workflow, concurrency |

---

## 10. End-to-End Workflow Walkthrough

This walkthrough demonstrates the complete PTW lifecycle using demo accounts.

### Step 1: Requester Creates a Permit

1. Log in as `requester@opmaint.local` / `password123`
2. Click **Create New Permit**
3. Complete the 5-step wizard:
   - **Step 1**: Select `HOT_WORK`, enter work description, contractor team, and planned dates
   - **Step 2**: Select Plant → Area → Equipment from the cascading dropdowns
   - **Step 3**: Fill Hot Work specific fields (fire watch, extinguisher, gas check readings)
   - **Step 4**: Add hazards, PPE requirements, and precautions checklist
   - **Step 5**: Review the permit — either **Save as Draft** or **Submit for Approval**
4. Choose **Submit for Approval**. Permit status changes to `PENDING_APPROVAL`.

### Step 2: Area Owner Approves

1. Log in as `ao.press@opmaint.local` / `password123`
2. Dashboard shows the permit under **Pending My Approval**
3. Click the permit → Action Panel shows **Approve** button
4. Click **Approve**, optionally add a comment, confirm
5. Area Owner slot is now fulfilled (shown in the Approval Status section)

### Step 3: Safety Officer Approves & Activates

1. Log in as `safety.officer@opmaint.local` / `password123`
2. Open the same permit (visible in My Approvals on dashboard)
3. Click **Approve** — both slots are now filled, status becomes `APPROVED`
4. Click **Activate** — status becomes `ACTIVE`, expiry timer starts

### Step 4: Requester Logs Work

1. Log back in as `requester@opmaint.local`
2. Open the active permit
3. In the **Work Logs** section, click **Log Work Progress**
4. Describe the work performed → Submit
5. Work log appears chronologically in the section

### Step 5: Safety Officer Suspends (optional)

1. As `safety.officer@opmaint.local`, open the active permit
2. Click **Suspend Work**, provide a reason (e.g., "Gas leak detected in adjacent area")
3. Status becomes `SUSPENDED` — work log entry is prohibited while suspended

### Step 6: Resume & Close

1. Safety Officer clicks **Resume Work** — status returns to `ACTIVE`
2. As Requester, click **Close Permit**, provide completion notes
3. Status becomes `CLOSED`

### Step 7: Verify Closure

1. Log in as `safety.officer@opmaint.local`
2. Open the `CLOSED` permit — **Verify Closure** button appears
3. Click **Verify Closure**, add site inspection notes
4. Status becomes `CLOSED_VERIFIED` — permit lifecycle complete

### Confined Space Entry/Exit (HOT WORK → CONFINED_SPACE_ENTRY)

- Create a `CONFINED_SPACE_ENTRY` permit against `WBY-TANK-01`
- After activation, the **Confined Space — Entry/Exit Log** section appears
- Use the **Entry/Exit** toggle to log personnel entering and exiting the confined space
- The roster summary shows how many people are currently inside

---

## 11. AI Usage Disclosure

This project was built with significant assistance from **Google Antigravity (AGY)**, an AI coding assistant. The AI assisted with:

- **Architecture design**: Defining the layered architecture (domain / application / API), selecting appropriate patterns for a multi-role workflow system, and establishing the testing strategy.
- **Code generation**: Generating the initial implementations of all modules, which were then reviewed and refined iteratively.
- **Test authorship**: Generating unit and integration test suites, including concurrent approval tests using real PostgreSQL transactions.
- **Domain modelling**: The state machine transitions, approval slot evaluation, and self-approval prevention logic were designed collaboratively.
- **Debugging**: Resolving TypeScript type errors, ESLint warnings, and test failures during development.

All generated code was reviewed for correctness, security properties, and alignment with the assignment specification. The authorization logic, in particular, was manually verified through the structured Phase 4 verification checklist described in the development history.
