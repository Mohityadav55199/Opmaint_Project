# Permit to Work (PTW) Module — Revised Implementation Plan

Based on the architecture review, this revised design transitions to a unified **Next.js App Router** full-stack architecture with a flexible **JSONB `typeData` + Type Registry** model, explicit **Approval Slots**, authoritative **Location Derivation**, pure **`checkAction`** authorization, strict **Concurrency Control**, and an append-only **Audit & Work Logging** system.

---

## 1. System Architecture & Directory Layout

Unified Next.js 15 (App Router) full-stack structure:

```
Opmaint_Project/
├── package.json              # Next.js, Prisma, Zod, Tailwind, Lucide, Vitest
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── prisma/
│   ├── schema.prisma         # Postgres schema with indexes, sequences & constraints
│   ├── migrations/           # Versioned migrations
│   └── seed.ts               # 4 users, 2 plants, 6 equipment, 11 permits
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx          # Root redirect / dashboard
│   │   ├── (auth)/
│   │   │   └── login/page.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx    # App navigation shell
│   │   │   ├── page.tsx      # Permit Dashboard (filters, active now, expiring < 2h)
│   │   │   ├── permits/
│   │   │   │   ├── new/page.tsx          # Multi-step dynamic form (wizard)
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx          # Permit Detail, Audit Timeline, Action Bar
│   │   │   │       └── mobile/page.tsx   # High-contrast mobile field view
│   │   │   └── admin/
│   │   │       └── page.tsx  # Admin screens for Users, Areas, Equipment
│   │   └── api/
│   │       ├── auth/
│   │       │   ├── login/route.ts
│   │       │   └── me/route.ts
│   │       ├── permits/
│   │       │   ├── route.ts              # GET (list/filter) & POST (create draft)
│   │       │   ├── [id]/
│   │       │   │   ├── route.ts          # GET (detail) & PATCH (edit draft/pending)
│   │       │   │   ├── actions/route.ts  # POST: submit, approve, reject, activate, suspend, resume, close, verify, cancel
│   │       │   │   ├── work-logs/route.ts# POST & GET work logs (enforces ACTIVE only)
│   │       │   │   ├── entry-logs/route.ts# POST & GET confined space entry/exit logs
│   │       │   │   └── extensions/route.ts# POST & PATCH extensions
│   │       │   └── conflicts/route.ts    # GET conflict warnings (Hot Work vs Confined Space)
│   │       ├── cron/
│   │       │   └── expire/route.ts       # Scheduled backstop for expiry
│   │       └── admin/
│   │           ├── users/route.ts
│   │           ├── areas/route.ts
│   │           └── equipment/route.ts
│   ├── lib/
│   │   ├── prisma.ts         # Prisma client singleton
│   │   ├── auth.ts           # JWT session handling & cookie utilities
│   │   ├── errors.ts         # Consistent API error classes (400, 403, 404, 409, 422)
│   │   └── time.ts           # IST plant time formatting & validity helpers
│   ├── domain/
│   │   ├── permit-registry/  # Dynamic type registry for Hot Work, Confined Space, Height, LOTO, Excavation
│   │   │   ├── registry.ts
│   │   │   ├── hot-work.ts
│   │   │   ├── confined-space.ts
│   │   │   ├── height.ts
│   │   │   ├── loto.ts
│   │   │   └── excavation.ts # Proof-of-extensibility dummy type
│   │   ├── state-machine/
│   │   │   ├── states.ts
│   │   │   ├── transitions.ts
│   │   │   ├── authorization.ts  # checkAction & getAvailableActions
│   │   │   └── engine.ts         # Atomic transition executor
│   │   ├── approvals/
│   │   │   └── slots.ts      # Slot evaluation & round management
│   │   ├── conflict/
│   │   │   └── detector.ts   # Hot Work vs Confined Space spatial-temporal checker
│   │   └── audit/
│   │       └── logger.ts     # In-transaction append-only audit logger
│   └── components/           # UI components (StatusBadge, Timeline, SignaturePad, Countdown)
├── docs/
│   ├── implementation-plan.md
│   ├── decisions.md
│   └── final-requirements-checklist.md
└── tests/                    # Vitest integration & concurrency tests
```

---

## 2. Database Schema (PostgreSQL + Prisma)

### Relational Models
1. **`User`**: `id`, `name`, `email`, `passwordHash`, `role` (`REQUESTER`, `AREA_OWNER`, `SAFETY_OFFICER`, `ADMIN`), `createdAt`.
2. **`Plant`**: `id`, `code`, `name`, `timezone` (default: `'Asia/Kolkata'`), `createdAt`.
3. **`Area`**: `id`, `plantId`, `name`, `code`, `ownerId` (references User: `equipment -> area -> area.ownerId` dictates the authoritative Area Owner), `createdAt`.
4. **`Equipment`**: `id`, `areaId`, `name`, `tagNumber`, `criticality`, `createdAt`.
5. **`Permit`**:
   - `id`: CUID/UUID
   - `permitSequence`: Int (auto-increment / sequence for `PTW-YYYY-XXXX`)
   - `permitNumber`: String (unique)
   - `status`: Enum (`DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `ACTIVE`, `SUSPENDED`, `REJECTED`, `EXPIRED`, `CLOSED`, `CLOSED_VERIFIED`, `CANCELLED`)
   - `type`: String (e.g. `'HOT_WORK'`, `'CONFINED_SPACE_ENTRY'`, `'WORKING_AT_HEIGHT'`, `'ELECTRICAL_ISOLATION_LOTO'`)
   - `requesterId`: String (references User)
   - `contractorTeam`: String
   - `workDescription`: String
   - `equipmentId`: String (authoritative source for Area and Plant)
   - `areaId`: String (derived from Equipment)
   - `plantId`: String (derived from Equipment)
   - `plannedStartTime`: DateTime
   - `plannedEndTime`: DateTime
   - `expiresAt`: DateTime (authoritative validity boundary)
   - `actualStartTime`: DateTime?
   - `actualEndTime`: DateTime?
   - `hazards`: Json (string array)
   - `ppeRequired`: Json (string array)
   - `precautionsChecklist`: Json (structured checklist with confirmations)
   - `typeData`: Jsonb (validated by `PermitTypeRegistry`)
   - `approvalRound`: Int (default 1, increments on post-submission edits)
   - `version`: Int (default 1, for optimistic concurrency)
   - `workCompletionNotes`: String?
   - `closureVerifiedNotes`: String?
   - `rejectionReason`: String?
   - `suspensionReason`: String?
   - `cancellationReason`: String?
   - `createdAt`, `updatedAt`
6. **`Approval`** (Explicit Slots):
   - `id`: String
   - `permitId`: String
   - `round`: Int
   - `slot`: Enum (`AREA_OWNER`, `SAFETY_OFFICER`)
   - `approverId`: String (references User)
   - `decision`: Enum (`APPROVED`, `REJECTED`)
   - `comment`: String?
   - `signatureSvg`: String? (canvas digital signature capture)
   - `createdAt`: DateTime
   - **Unique Constraint**: `@@unique([permitId, round, slot])`
7. **`WorkLogEntry`**:
   - `id`, `permitId`, `authorId`, `description`, `performedAt`, `createdAt`
   - Strict constraint: can only be inserted when permit is `ACTIVE`.
8. **`EntryExitLog`** (for Confined Space):
   - `id`, `permitId`, `workerName`, `enteredAt`, `exitedAt`?, `attendantId`, `createdAt`
   - Strict constraint: can only be logged when permit is `ACTIVE`.
9. **`PermitExtension`**:
   - `id`, `permitId`, `requestedHours`: Int, `reason`: String, `status`: Enum (`PENDING`, `APPROVED`, `REJECTED`), `requesterId`: String, `approverId`: String?, `previousExpiresAt`: DateTime, `newExpiresAt`: DateTime?, `createdAt`: DateTime
10. **`AuditLog`** (Immutable append-only):
   - `id`, `permitId`, `actorId`?, `actorLabel`: String (user name or `'SYSTEM'`), `actorRole`: String, `action`: String, `field`?: String, `fromValue`?: String, `toValue`?: String, `comment`?: String, `createdAt`: DateTime

---

## 3. The Permit Type Registry

Interface:
```typescript
export interface PermitTypeDefinition<T = any> {
  key: string;
  label: string;
  schema: z.ZodSchema<T>;
  requiredSlots: ('AREA_OWNER' | 'SAFETY_OFFICER')[];
  defaultPrecautions: string[];
  validateCustomRules?: (typeData: T, permit: Partial<Permit>) => string | null;
  renderConfig: {
    sections: { title: string; fields: FormFieldConfig[] }[];
  };
}
```

Registered types:
- `HOT_WORK`: type (welding, grinding, cutting, soldering), fire watch, fire extinguisher, combustibles radius, gas test (LEL %, O2 %, time).
- `CONFINED_SPACE_ENTRY`: space ID, entry point, atmospheric test (O2, LEL, H2S, CO, time), standby attendant, rescue plan, ventilation method.
- `WORKING_AT_HEIGHT`: height in metres, access method, fall arrest, anchor point checked, barricading.
- `ELECTRICAL_ISOLATION_LOTO`: equipment tag, voltage level, isolation points, lock numbers, tag numbers, earthing applied, tested dead by.
- `EXCAVATION` (Registered in tests/demo to demonstrate zero-rewrite extensibility): trench depth, soil type, shoring installed, underground utilities scanned.

---

## 4. Single-Source Authorization Engine (`checkAction`)

```typescript
export function checkAction(
  permit: PermitWithRelations,
  user: AuthenticatedUser,
  action: PermitAction,
  now: Date = new Date()
): { allowed: boolean; reason?: string; httpStatus?: number }
```

- **`SUBMIT`**: Allowed only for `permit.requesterId === user.id` or `ADMIN`. Permit must be `DRAFT`. Validates all required fields, timing (`now < plannedEndTime`).
- **`APPROVE`**: Permit must be `PENDING_APPROVAL`.
  - Check user is not requester (`user.id !== permit.requesterId`).
  - If filling `AREA_OWNER` slot: `user.role === 'AREA_OWNER'` and `user.areaId === permit.areaId`.
  - If filling `SAFETY_OFFICER` slot: `user.role === 'SAFETY_OFFICER'` or `ADMIN`.
  - Slot must not already be approved in `permit.approvalRound`.
  - Approver must not have already approved another slot in this round.
- **`REJECT`**: Requires non-empty reason (trimmed). Area Owner or Safety Officer or Admin. Immediately marks `REJECTED`.
- **`ACTIVATE`**:
  - Permit must be `APPROVED`.
  - Must have all required slots approved for current round.
  - `now >= permit.plannedStartTime` (cannot activate before start).
  - `now < permit.expiresAt` (cannot activate if expired).
  - Allowed for Requester (owner) or Safety Officer or Admin.
- **`SUSPEND`**: Permit must be `ACTIVE`. Safety Officer or Admin only. Mandatory non-empty reason.
- **`RESUME`**: Permit must be `SUSPENDED`. Safety Officer or Admin only. `now < permit.expiresAt` (cannot resume if past validity).
- **`CLOSE`**: Permit must be `ACTIVE`. Requester (owner) or Admin. Requires completion notes.
- **`VERIFY_CLOSURE`**: Permit must be `CLOSED`. Safety Officer or Admin. `user.id !== permit.requesterId`.
- **`CANCEL`**: Any non-terminal state (`DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `ACTIVE`, `SUSPENDED`). Requester, Safety Officer, or Admin. Mandatory non-empty reason.

---

## 5. Post-Submission Edit Policy & Approval Invalidation

- **`DRAFT`**: Requester can edit all fields freely.
- **`PENDING_APPROVAL`**:
  - Only non-safety metadata (e.g. contractor contact name) can be edited without invalidation.
  - Any edit to core scope, equipment, timing, hazards, or `typeData` invalidates all existing approvals in the current round, increments `approvalRound`, and creates an audit entry for each modified field (`fromValue -> toValue`).
- **`APPROVED`**:
  - Any edit invalidates approvals, returns status to `PENDING_APPROVAL`, increments `approvalRound`, and logs audit trail.
- **`ACTIVE` and later**:
  - Normal permit fields are strictly immutable. Only work logs, entry/exit logs, extensions, suspension/closure actions are permitted.

---

## 6. Authoritative Expiration & Concurrency Handling

1. **Validity Rule**:
   ```typescript
   export function isPastValidity(permit: { expiresAt: Date }, now: Date = new Date()): boolean {
     return now.getTime() >= permit.expiresAt.getTime();
   }
   ```
2. **Lazy Expiration on Access**:
   Any query reading a permit in `ACTIVE` or `SUSPENDED` checks `isPastValidity`. If true, an atomic background update transitions the permit to `EXPIRED` and writes an audit log (`actorLabel: 'SYSTEM'`).
3. **Optimistic & Row Concurrency**:
   - Critical transitions use Prisma transactions (`prisma.$transaction`) with `version` check:
     ```typescript
     const updated = await tx.permit.updateMany({
       where: { id: permitId, version: currentVersion, status: expectedStatus },
       data: { status: nextStatus, version: { increment: 1 }, ...data }
     });
     if (updated.count === 0) throw new ConflictError("Permit was concurrently modified");
     ```
   - Unique constraint on `(permitId, round, slot)` prevents race-condition double approvals.
4. **Permit Number Generation**:
   Uses a dedicated PostgreSQL sequence or atomic counter table to format `PTW-YYYY-XXXX`, preventing gaps or collisions under concurrent creation.

---

## 7. Audit & Work Logging

- **Immutable Audit Trail**:
  Every state transition, slot approval, rejection, suspension, post-submission field edit, extension, and system expiration creates an `AuditLog` row inside the same database transaction.
- **Strict Work Logging**:
  `POST /api/permits/[id]/work-logs` checks `permit.status === 'ACTIVE'`. Any other status throws `422 Unprocessable Entity` ("Work cannot be logged against a permit that isn't ACTIVE").

---

## 8. Frontend Screens (Next.js App Router + Tailwind)

1. **Permit Dashboard (`/`)**:
   - Header with Quick Stats: Total Active, Expiring in < 2 Hours, Pending My Approval.
   - Prominent "Expiring Soon (< 2h)" urgent warning banner with real-time countdown.
   - Filter bar: Status, Permit Type, Area, Date Range, "My Approvals Pending" toggle.
   - Paginated/scrollable permit table with high-visibility status badges and plant time (IST).
2. **Multi-Step Create Permit (`/permits/new`)**:
   - Step 1: Equipment & Location (select equipment -> auto-derives Area & Plant), contractor team, work description, planned start/end times.
   - Step 2: Hazards & PPE Checklists + Precautions.
   - Step 3: Dynamic Type-Specific Fields rendered automatically from `PermitTypeRegistry`.
   - Step 4: Approver slot review & Draft save / Submit.
3. **Permit Detail (`/permits/[id]`)**:
   - Complete Permit Details & Type-specific data card.
   - Approval Slots Card: Status of Area Owner and Safety Officer slots with sign-off details.
   - Work Logs & Confined Space Entry/Exit Logs tab (with live logging when ACTIVE).
   - Human-readable Audit Timeline (who, what, when, from-value, to-value, notes).
   - Dynamic Action Bar: Actions dynamically rendered strictly from `getAvailableActions`.
4. **Mobile Permit View (`/permits/[id]/mobile`)**:
   - Large touch targets (min 48px), high-contrast badges, single-handed workflow for plant floor technicians wearing gloves.
5. **Admin Master Data View (`/admin`)**:
   - Simple tabs to view/manage Users, Plants, Areas, and Equipment.

---

## 9. Comprehensive Testing Plan

Tests executed via **Vitest**:
1. **State Machine Transitions**: All valid transitions, illegal transitions, terminal states.
2. **Approval Slots & Self-Approval**: Area Owner slot matches equipment area; Safety Officer slot; self-approval fails with 403; duplicate slot fails with 409; round increment on edit.
3. **Type Registry Extensibility**: Registers a dummy 5th type (`EXCAVATION`), runs through draft -> submit -> approve -> activate without touching core code.
4. **Authoritative Expiry**: Boundary tests at `expiresAt - 1s`, `expiresAt`, `expiresAt + 1s`. Verifies activation & resume fail after expiry.
5. **Work Logging Guard**: Rejects logs when status is DRAFT, PENDING_APPROVAL, APPROVED, SUSPENDED, EXPIRED, CLOSED, CANCELLED.
6. **Concurrency Suite**: `Promise.all` tests for simultaneous approvals, approve vs reject races, and double activation.
7. **Adversarial API Tests**: Malformed bodies, forged areas, bypass attempts.

---

## 10. Granular Git Commit Strategy

1. `chore: initialize Next.js App Router project with TypeScript and Tailwind CSS`
2. `docs: add revised architecture implementation plan and decisions`
3. `feat: add prisma schema with postgresql models and migrations`
4. `feat: implement permit type registry and extensibility engine`
5. `feat: implement single-source authorization engine and state machine`
6. `feat: implement approval slots and multi-round invalidation`
7. `feat: implement immutable audit logging and work log validation`
8. `feat: implement authoritative expiry and spatial-temporal conflict detection`
9. `test: add unit and integration tests for state machine, rbac, and extensibility`
10. `test: add concurrency and adversarial api tests`
11. `feat: add realistic industrial seed data with 4 roles and 11 permits`
12. `feat: build responsive permit dashboard with expiring soon banner`
13. `feat: build multi-step dynamic permit creation wizard`
14. `feat: build permit detail view, approval slot cards, and audit timeline`
15. `feat: build mobile-first permit inspection view and digital signature capture`
16. `feat: build admin management view for users, areas, and equipment`
17. `fix: edge cases, concurrent transaction hardening, and error states`
18. `chore: configure production deployment and vercel compatibility`
19. `docs: complete README, setup instructions, and final requirements checklist`
