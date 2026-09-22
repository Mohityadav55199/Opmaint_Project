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
  - `expiresAt` is initialized to `plannedEndTime` on permit creation and updated transactionally when a `PermitExtension` is approved.
  - Expiry is enforced across all non-terminal states (`DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `ACTIVE`, `SUSPENDED`). When `now >= expiresAt`, the permit cannot be approved, activated, or resumed, and transitions to `EXPIRED`.

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

### 4. Post-Submission Edits & Safety-Critical Fields
- **Decision**:
  - `EDIT` is only permitted while the permit is in `DRAFT` status by the requester or Admin.
  - Once submitted (`PENDING_APPROVAL`, `APPROVED`, `ACTIVE`), core safety fields cannot be silently updated.
  - **Safety-Critical Fields**: `equipmentId`, `plannedStartTime`, `plannedEndTime`, `expiresAt`, `hazards`, `ppeRequired`, `precautionsChecklist`, and `typeData`.
  - If a submitted or approved permit requires safety modifications, it must be recalled/cancelled and re-submitted, or increment `approvalRound` to completely reset approvals.
  - Every change to a permit records an immutable row in `AuditLog` capturing `actorId`, `actorRole`, `action`, `field`, `fromValue`, and `toValue`.

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
