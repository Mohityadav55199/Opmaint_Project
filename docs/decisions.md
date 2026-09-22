# Architectural Decisions Log

This document records the architectural and business decisions made for the Opmaint Permit to Work (PTW) system, formalizing all rules across the domain model, state transitions, security, and data integrity.

---

### 1. Area Ownership & Location Derivation Model
- **Decision**: 
  - `Equipment` is the sole authoritative anchor for a permit's plant and area location: `Permit -> Equipment -> Area -> Plant`.
  - Redundant `Permit.areaId` and `Permit.plantId` database columns are removed from the database schema to eliminate denormalization anomalies.
  - The client is **never** trusted to provide `areaId` or `plantId`. Location is strictly resolved server-side from `equipmentId`.
  - An `Area` has an authoritative `ownerId` referencing a `User`.
  - The `AREA_OWNER` approval slot is strictly bounded to `permit.equipment.area.ownerId`. An Area Owner for Area B cannot approve or reject permits for equipment belonging to Area A.

---

### 2. Expiry Semantics & Authoritative Validity Boundary
- **Decision**:
  - `plannedStartTime`: Scheduled start of maintenance work.
  - `plannedEndTime`: Originally requested/planned end of work.
  - `expiresAt`: **Authoritative current permit validity boundary**.
  - All operations — activation, resume, lazy expiry, extension validation, and conflict checking — use `expiresAt` as the single source of truth.
  - **Pre-Activation Boundary**: Prior to activation, `expiresAt` **MUST exactly equal `plannedEndTime`**. The client cannot provide a later `expiresAt` to bypass `maxValidityHours`.
  - `expiresAt` is updated transactionally only when a `PermitExtension` is formally approved.
  - **Expiry Eligibility**: Expiry applies exclusively to workflow states: `PENDING_APPROVAL`, `APPROVED`, `ACTIVE`, and `SUSPENDED`. `DRAFT` permits cannot expire as work has not been authorized.
  - **System-Only Execution**: `EXPIRE` is an automated system transition executed by the system scheduler (`actorId: "SYSTEM"`). Normal users cannot invoke `EXPIRE` (HTTP 403), and `EXPIRE` is never presented in `getAvailableActions()`.
  - Expiry is idempotent.
  - When `now >= expiresAt`, `RESUME` is strictly refused for suspended permits.
  - Atmospheric/gas test timestamps (`gasTestTime`) must be valid datetime strings and cannot be in the future.

---

### 3. Maximum Validity per Permit Type
- **Decision**: Each permit type registered in `PermitTypeRegistry` specifies a hard ceiling `maxValidityHours`:
  - `HOT_WORK`: 12 hours (standard single shift)
  - `CONFINED_SPACE_ENTRY`: 12 hours (continuous attendant requirement)
  - `WORKING_AT_HEIGHT`: 12 hours (daylight/shift requirement)
  - `ELECTRICAL_ISOLATION_LOTO`: 24 hours (isolated machinery turnaround)
  - `EXCAVATION`: 24 hours (daily soil inspection cycle)
- **Enforcement**: At submission (`SUBMIT`), `(plannedEndTime - plannedStartTime) / 3600000 <= type.maxValidityHours` is strictly validated. Submissions exceeding this limit are rejected with HTTP 422.

---

### 4. Post-Submission Edits & Safety Integrity
- **Decision**:
  - **Post-submission edits are strictly prohibited.**
  - `EDIT` is only permitted while the permit is in `DRAFT` status by the requester or Admin.
  - Once submitted, permits in `PENDING_APPROVAL`, `APPROVED`, `ACTIVE`, `SUSPENDED`, `CLOSED`, `CLOSED_VERIFIED`, `REJECTED`, `EXPIRED`, and `CANCELLED` cannot be modified via field edits.
  - If a submitted or approved permit requires scope or safety changes, it must be cancelled and a new permit created with revised parameters.
  - **Assignment Requirement Clarification**: The assignment mentions auditing "every field edit after submission". Because this implementation deliberately prohibits all post-submission field edits to protect safety integrity, there are zero post-submission field edits to audit. All state changes, extensions, and lifecycle actions are executed via dedicated domain operations and recorded immutably in `AuditLog`.
  - `approvalRound` is preserved in the schema for multi-round approval tracking and future extensions, without an ad-hoc approval reset edit workflow.

---

### 4b. Work Logging Status Rule
- **Decision**:
  - In strict compliance with the assignment rule (*"Work cannot be logged against a permit that isn't ACTIVE"*), `LOG_WORK` is permitted **only** when `Permit.status === "ACTIVE"`.
  - Work logging is rejected in `SUSPENDED` and all other states.

---

### 5. Rejection Semantics
- **Decision**:
  - Rejection is recorded directly against an **unfilled approval slot** for the current `approvalRound`.
  - A user may `REJECT` only if:
    1. The permit is in `PENDING_APPROVAL` status.
    2. The user is eligible to fill a required approval slot for this permit.
    3. That specific slot is currently **unfilled** in the current round.
    4. The user has not already approved another slot in the same round.
    5. The user is not the requester (`permit.requesterId !== user.id`). Requesters must use `CANCEL`.
    6. The user is not attempting to reject through an already-approved slot.
  - A mandatory, trimmed, non-empty `reason` payload is required (`rejectPayloadSchema`).
  - Upon rejection, the permit transitions immediately to terminal state `REJECTED`.

---

### 6. Cancellation Rules by State and Role
- **Decision**:
  - `DRAFT`: Requester or Admin may cancel.
  - `PENDING_APPROVAL`: Requester or Admin may cancel.
  - `APPROVED` (prior to activation): Requester or Admin may cancel.
  - `ACTIVE`: **Only a Safety Officer or an Administrator may cancel**. Requesters are strictly forbidden from cancelling active work to prevent bypassing formal safety closeout and housekeeping inspections.
  - `SUSPENDED`: **Only a Safety Officer or an Administrator may cancel**.
  - All cancellations require a mandatory, trimmed, non-empty `reason` payload (`cancelPayloadSchema`).

---

### 7. Extension Policy & Constraints
- **Decision**:
  - Extensions can only be requested on `ACTIVE` or `SUSPENDED` permits before `expiresAt`.
  - Rules enforced in domain and database:
    1. Maximum of **2 extensions** per permit.
    2. Maximum cumulative extension duration of **4 hours** across all extensions.
    3. Maximum single extension duration of **4 hours** (`requestedHours: 1..4`).
    4. Only **one pending extension** at a time (enforced via PostgreSQL partial unique index `WHERE status = 'PENDING'`).
  - Requester requests extension (`REQUEST_EXTENSION`); only a `SAFETY_OFFICER` or `ADMIN` can `APPROVE_EXTENSION` or `REJECT_EXTENSION`.
  - Requester cannot approve their own extension.

---

### 8. Closure Separation of Duties
- **Decision**:
  - Marking work complete (`CLOSE`) transitions `ACTIVE -> CLOSED` and records `closedById: user.id` and `workCompletionNotes`. Requester or Admin can close.
  - Formal closure verification (`VERIFY_CLOSURE`) transitions `CLOSED -> CLOSED_VERIFIED` (terminal).
  - Separation of duties:
    - `verifier.id !== permit.requesterId` (Zero self-verification).
    - `verifier.id !== permit.closedById` (The person who closed work cannot verify their own closure).
    - Verifier must hold role `SAFETY_OFFICER` or `ADMIN`.

---

### 9. Public vs Authenticated Access to `/permits/[id]`
- **Decision**:
  - **Read-Only Status View**: Unauthenticated / public access is allowed for read-only inspection (e.g. scanning a printed QR code on physical plant equipment). It displays permit status, validity window, safety precautions, and active hazards.
  - **Action & Mutation Controls**: All workflow actions (`APPROVE`, `REJECT`, `ACTIVATE`, `SUSPEND`, `RESUME`, `CLOSE`, `VERIFY_CLOSURE`, `CANCEL`, `EXTEND`) strictly require authentication via JWT.
  - Authentication validates the JWT against PostgreSQL, verifying `User.isActive === true` and enforcing the database's authoritative role rather than trusting JWT claims.

---

### 10. Audit Trail Immutability
- **Decision**:
  - `AuditLog` is strictly append-only.
  - Foreign keys: `AuditLog.permitId -> RESTRICT` and `AuditLog.actorId -> RESTRICT` to prevent cascading deletions from removing audit evidence.
  - PostgreSQL trigger `enforce_audit_log_immutability` blocks any `UPDATE` or `DELETE` operations on `AuditLog` at the database level.
