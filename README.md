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
7. [Demo Accounts & Seeded Data](#7-demo-accounts--seeded-data)
8. [API Reference](#8-api-reference)
9. [Testing & Quality Assurance](#9-testing--quality-assurance)
10. [End-to-End Workflow Walkthrough](#10-end-to-end-workflow-walkthrough)
11. [Production Deployment](#11-production-deployment)
12. [AI Usage Disclosure](#12-ai-usage-disclosure)

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

## 7. Demo Accounts & Seeded Data

All demo accounts are seeded with the password: **`password123`**

### Demo Users

| Email                          | Name                                       | Role             | Permissions & Scope                                                |
|--------------------------------|--------------------------------------------|------------------|--------------------------------------------------------------------|
| `admin@opmaint.local`          | Rajesh Kumar (Plant Head / Admin)          | `ADMIN`          | Full system administrative access, all plants/equipment            |
| `safety.officer@opmaint.local` | Priya Sharma (Chief Safety Officer)        | `SAFETY_OFFICER` | Safety approvals, permit activation, suspension, closure verification |
| `ao.press@opmaint.local`       | Vikram Mehta (Press Shop Owner)            | `AREA_OWNER`     | Area Owner for `PRESS_SHOP` (Pune) & `ASSEMBLY_LINE` (Chennai)    |
| `ao.paint@opmaint.local`       | Pooja Sharma (Paint Shop Owner)            | `AREA_OWNER`     | Area Owner for `PAINT_SHOP` (Pune) & `WAREHOUSE` (Chennai)        |
| `ao.utils@opmaint.local`       | Arjun Nair (Utilities Area Owner)          | `AREA_OWNER`     | Area Owner for `UTILITY_YARD` (Pune)                              |
| `requester@opmaint.local`      | Sunil Verma (Maintenance Lead / Requester) | `REQUESTER`      | Creates permits, edits drafts, submits, logs work, closes permits  |

### Plant, Area & Equipment Hierarchy

- **Pune Automotive Manufacturing Facility** (`PUNE-PLANT-01`)
  - **Heavy Stamping & Press Shop** (`PRESS_SHOP`) — Owner: `ao.press@opmaint.local`
    - `EQ-PRS-4001` — 4000-Ton Hydraulic Transfer Press #1 (`CRITICAL`)
    - `EQ-PRS-2500` — 2500-Ton Progressive Die Press #2 (`HIGH`)
  - **Automated Robotic Paint Facility** (`PAINT_SHOP`) — Owner: `ao.paint@opmaint.local`
    - `EQ-PNT-BOOTH1` — Robotic Spray Coating Booth Alpha (`HIGH`)
  - **Central Utility & Boiler House** (`UTILITY_YARD`) — Owner: `ao.utils@opmaint.local`
    - `EQ-UTL-BOIL1` — High-Pressure Steam Boiler Unit 1 (`CRITICAL`)
- **Chennai Component Assembly Plant** (`CHN-PLANT-01`)
  - **Final Assembly Line** (`ASSEMBLY_LINE`) — Owner: `ao.press@opmaint.local`
    - `EQ-ASM-ROB01` — Welding Robot Arm — Station A (`HIGH`)
  - **Finished Goods Warehouse** (`WAREHOUSE`) — Owner: `ao.paint@opmaint.local`
    - `EQ-WH-CONV01` — Automated Pallet Conveyor System (`MEDIUM`)

### Seeded Demonstration Permits (12 Lifecycle States)

The seed script (`prisma/seed.ts`) populates the database with 12 distinct permits demonstrating the entire PTW lifecycle with complete, immutable audit trails:

| Permit Number   | Status              | Type                      | Equipment      | Highlights & Seed Details                                      |
|-----------------|---------------------|---------------------------|----------------|----------------------------------------------------------------|
| `PTW-2026-0001` | `DRAFT`             | `HOT_WORK`                | `EQ-PRS-4001`  | Initial draft; editable by requester                           |
| `PTW-2026-0002` | `PENDING_APPROVAL`  | `CONFINED_SPACE_ENTRY`    | `EQ-UTL-BOIL1` | Awaiting Area Owner (`ao.utils`) & Safety Officer approval     |
| `PTW-2026-0003` | `APPROVED`          | `WORKING_AT_HEIGHT`       | `EQ-ASM-ROB01` | Both approval slots satisfied; ready for activation            |
| `PTW-2026-0004` | `ACTIVE`            | `ELECTRICAL_ISOLATION_LOTO`| `EQ-PRS-2500` | Activated by Safety Officer; in operational progress           |
| `PTW-2026-0005` | `ACTIVE` (Urgent)   | `HOT_WORK`                | `EQ-PRS-4001`  | **Expiring soon**: validity window expires in ~75 minutes      |
| `PTW-2026-0006` | `ACTIVE` (Logs)     | `CONFINED_SPACE_ENTRY`    | `EQ-UTL-BOIL1` | Has work log history & active personnel entry/exit roster      |
| `PTW-2026-0007` | `SUSPENDED`         | `HOT_WORK`                | `EQ-PNT-BOOTH1`| Suspended due to solvent fumes; work logging blocked           |
| `PTW-2026-0008` | `CLOSED`            | `ELECTRICAL_ISOLATION_LOTO`| `EQ-PRS-4001` | Closed with work completion notes; awaiting verification       |
| `PTW-2026-0009` | `CLOSED_VERIFIED`   | `WORKING_AT_HEIGHT`       | `EQ-WH-CONV01` | Closure verified on-site by Safety Officer (terminal state)   |
| `PTW-2026-0010` | `EXPIRED`           | `HOT_WORK`                | `EQ-PRS-2500`  | Validity window lapsed; transitioned to EXPIRED by SYSTEM actor |
| `PTW-2026-0011` | `REJECTED`          | `CONFINED_SPACE_ENTRY`    | `EQ-PNT-BOOTH1`| Rejected by Safety Officer with formal non-compliance reason   |
| `PTW-2026-0012` | `CANCELLED`         | `ELECTRICAL_ISOLATION_LOTO`| `EQ-ASM-ROB01` | Cancelled by requester due to production rescheduling          |

---

## 8. API Reference

### Authentication

| Method | Path              | Description                             |
|--------|-------------------|-----------------------------------------|
| POST   | `/api/auth/login`  | Authenticate and receive session cookie |
| GET    | `/api/auth/me`     | Get current authenticated user session  |
| POST   | `/api/auth/logout` | Invalidate session cookie               |

### Master Data

| Method | Path               | Description                             |
|--------|--------------------|-----------------------------------------|
| GET    | `/api/plants`      | List all plants                         |
| GET    | `/api/areas`       | List areas (filterable by `plantId`)    |
| GET    | `/api/equipment`   | List equipment (filterable by `areaId`) |

### Permits

| Method | Path                               | Description                             |
|--------|------------------------------------|-----------------------------------------|
| GET    | `/api/permits`                     | List permits (filterable, paginated)    |
| POST   | `/api/permits`                     | Create new DRAFT permit                 |
| GET    | `/api/permits/:id`                 | Get full permit detail with lazy expiry |
| PATCH  | `/api/permits/:id`                 | Update DRAFT permit fields              |
| GET    | `/api/permits/:id/actions`         | Get authorized actions for current user |
| POST   | `/api/permits/:id/submit`          | Submit DRAFT for approval               |
| POST   | `/api/permits/:id/approve`         | Approve an approval slot                |
| POST   | `/api/permits/:id/reject`          | Reject with formal reason               |
| POST   | `/api/permits/:id/activate`        | Activate APPROVED permit                |
| POST   | `/api/permits/:id/suspend`         | Suspend ACTIVE permit                   |
| POST   | `/api/permits/:id/resume`          | Resume SUSPENDED permit                 |
| POST   | `/api/permits/:id/cancel`          | Cancel permit (permanent)               |
| POST   | `/api/permits/:id/close`           | Close with completion notes             |
| POST   | `/api/permits/:id/verify-closure`  | Safety Officer closure verification     |
| GET    | `/api/permits/:id/work-logs`       | List work logs                          |
| POST   | `/api/permits/:id/work-logs`       | Add work log (ACTIVE status only)       |
| GET    | `/api/permits/:id/entry-logs`      | List entry/exit logs                    |
| POST   | `/api/permits/:id/entry-logs`      | Add entry/exit log (ACTIVE CS permits)  |

### Dashboard & Scheduled Lifecycle

| Method | Path                | Description                                                |
|--------|---------------------|------------------------------------------------------------|
| GET    | `/api/dashboard`    | Operational overview: permits, KPIs, expiring, approvals   |
| POST   | `/api/cron/expire`  | Protected scheduled sweep endpoint (requires `CRON_SECRET`)|

---

## 9. Testing & Quality Assurance

```bash
# Unit tests (100 tests — pure domain logic, zero DB, <3s)
npm run test:unit

# PostgreSQL integration tests (142 tests — real DB required)
npm run test:integration

# TypeScript typecheck
npm run typecheck

# ESLint (0 errors, 0 warnings)
npm run lint

# Production build
npm run build
```

### Test Strategy & Sequential Execution

The test suite is structured into two complementary layers:

1. **Unit Tests (100 tests)**:
   - Run via `npm run test:unit` (`vitest run --exclude '**/*.integration.test.ts'`).
   - Pure domain logic tests covering input validation, approval slot evaluation, self-approval prevention, state-machine transitions, expiry semantics, and type registry extensibility.
   - Run in <3 seconds with zero external database dependencies.

2. **Integration Tests (142 tests)**:
   - Run via `npm run test:integration`.
   - Executed **sequentially** across 7 test files (`postgres`, `auth-api`, `master-data`, `permit-api`, `workflow`, `operational-lifecycle`, `dashboard-api`).
   - **Why sequential**: Each test suite spawns an isolated, real embedded PostgreSQL instance on a dedicated port (ports 54330 through 54335) with its own database, runs full Prisma migrations, installs PostgreSQL PL/pgSQL immutability triggers, seeds master data, and executes real concurrent HTTP transactions. Running sequentially prevents port collisions and avoids host CPU/memory resource starvation.

### Test Coverage Summary

| Suite / File                            | Tests | Type        | Scope                                                   |
|-----------------------------------------|-------|-------------|---------------------------------------------------------|
| `payload-validation.test.ts`            | 19    | Unit        | Input schema validation, banned fields, date boundaries |
| `submit-and-validity.test.ts`           | 17    | Unit        | Submission business rules, checklist requirements       |
| `authorization-and-slots.test.ts`       | 31    | Unit        | Role checks, slot evaluation, self-approval prevention  |
| `state-machine.test.ts`                 | 10    | Unit        | Status transitions, allowed actions, preconditions      |
| `expiry-and-conflict.test.ts`           | 13    | Unit        | Expiry detection, spatial-temporal area conflicts       |
| `permit-registry-extensibility.test.ts` | 6     | Unit        | Type-specific field schemas, validation rules           |
| `auth-and-security.test.ts`             | 4     | Unit        | JWT secret verification, database-backed roles          |
| `postgres.integration.test.ts`          | 10    | Integration | PostgreSQL PL/pgSQL triggers, unique constraints, CHECK |
| `auth-api.integration.test.ts`          | 12    | Integration | Real login, HTTP-only cookie, session endpoint `/me`    |
| `master-data.integration.test.ts`       | 25    | Integration | Plants, areas, equipment cascading lookup APIs          |
| `permit-api.integration.test.ts`        | 27    | Integration | Permit CRUD, pagination, filtering, input validation    |
| `workflow.integration.test.ts`          | 31    | Integration | Multi-role approval workflow, slot fulfillment          |
| `operational-lifecycle.integration.test.ts` | 22 | Integration | Work logs, confined space roster, suspend/resume/expire |
| `dashboard-api.integration.test.ts`     | 15    | Integration | Dashboard KPIs, expiring permits, action evaluation     |
| **Total**                               | **242** | **100 Unit + 142 Integration** | **Complete domain & end-to-end verification** |

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

### Confined Space Entry/Exit Workflow

- Create or open a `CONFINED_SPACE_ENTRY` permit against `EQ-UTL-BOIL1` (Central Utility Boiler Unit 1)
- After activation by Safety Officer, the **Confined Space — Entry/Exit Log** section appears
- Use the **Log Entry / Exit** toggle to record personnel entering and exiting the vessel
- The real-time roster badge displays the live headcount of workers currently inside

---

## 11. Production Deployment

### Production Architecture
- **Web Application & APIs**: Next.js 16 (App Router) deployed on **Vercel**
- **Authoritative Database**: **PostgreSQL** hosted on **Supabase** / **Neon**
- **Scheduled Expiry Sweep**: Vercel Cron triggering `POST /api/cron/expire` every 10 minutes

### Production Environment Variables

| Variable | Requirement & Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string with SSL (`sslmode=require`) |
| `JWT_SECRET` | Cryptographically random secret key (minimum 32 characters; rejects default placeholder in production) |
| `CRON_SECRET` | Secret token authorizing automated Vercel Cron expiry sweeps |
| `NEXT_PUBLIC_APP_URL` | Canonical public URL of the deployed application (e.g. `https://opmaint.vercel.app`) |
| `NODE_ENV` | Must be set to `production` |

### Deployment Steps

1. **Database Setup**:
   ```bash
   # Apply PostgreSQL migrations including PL/pgSQL immutability triggers
   npx prisma migrate deploy

   # Seed the 12 demonstration permits and role-based demo accounts
   npm run db:seed
   ```

2. **Vercel Deployment**:
   ```bash
   # Deploy via Vercel CLI or connect GitHub repository
   vercel --prod
   ```

3. **Configure Environment Variables** in Vercel Project Settings (`DATABASE_URL`, `JWT_SECRET`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL`, `NODE_ENV`).

---

## 12. AI Usage Disclosure

This project was built with significant assistance from **Google Antigravity (AGY)**, an AI coding assistant. The AI assisted with:

- **Architecture design**: Defining the layered architecture (domain / application / API), selecting appropriate patterns for a multi-role workflow system, and establishing the testing strategy.
- **Code generation**: Generating the initial implementations of all modules, which were then reviewed and refined iteratively.
- **Test authorship**: Generating unit and integration test suites, including concurrent approval tests using real PostgreSQL transactions.
- **Domain modelling**: The state machine transitions, approval slot evaluation, and self-approval prevention logic were designed collaboratively.
- **Debugging**: Resolving TypeScript type errors, ESLint warnings, and test failures during development.

All generated code was reviewed for correctness, security properties, and alignment with the assignment specification. The authorization logic, in particular, was manually verified through the structured Phase 4 verification checklist described in the development history.
