# Architectural Decisions Log

This document records the architectural and business decisions made where the assignment specification was silent or flexible.

---

### 1. Required Approver Slots
- **Decision**: By default, every permit requires two distinct approver slots:
  1. `AREA_OWNER` (must be assigned to the equipment's derived area).
  2. `SAFETY_OFFICER`.
- **Rationale**: Industrial plants require both operational ownership (the Area Owner who controls the plant area/equipment) and safety oversight (the Safety Officer who verifies gas tests, atmospheric readings, and emergency preparedness). Simple count-based approvals fail if two Safety Officers approve without Area Owner sign-off.
- **Enforcement**: Stored in `Approval` with a `slot` enum and unique constraint `@@unique([permitId, round, slot])`.

---

### 2. Admin Approval & Self-Approval Behavior
- **Decision**: 
  - An Admin CANNOT approve their own permit under any circumstance.
  - An Admin can satisfy the `SAFETY_OFFICER` slot if they are not the requester.
  - An Admin CANNOT satisfy the `AREA_OWNER` slot unless they are explicitly assigned as the owner of that specific area.
- **Rationale**: Safety-critical compliance mandates separation of duties. No single user, regardless of administrative privileges, may unilaterally author and self-authorize dangerous industrial work.

---

### 3. State Transition: Who Can Resume a Suspended Permit?
- **Decision**: Only a `SAFETY_OFFICER` or an `ADMIN` can resume a `SUSPENDED` permit. The `REQUESTER` cannot resume.
- **Rationale**: Suspension happens for safety reasons (e.g., gas leak alarm, hazardous weather, emergency). Work must not restart until safety personnel re-inspect the atmosphere and clear the hazard.
- **Condition**: Must still be valid (`now < expiresAt`). If the validity window passed while suspended, the permit transitions to `EXPIRED` and cannot be resumed.

---

### 4. Who Can Cancel a Permit?
- **Decision**:
  - The `REQUESTER` (owner) can cancel their own non-terminal permit at any time.
  - A `SAFETY_OFFICER` or `ADMIN` can cancel any non-terminal permit.
  - An `AREA_OWNER` cannot cancel permits (they can reject during approval).
- **Rationale**: The requester may call off the job if contractor personnel fail to report or plant conditions change. Safety Officers need emergency cancellation authority. All cancellations require a mandatory, non-empty cancellation reason.

---

### 5. Expiry Behavior & Inactive State Expiry
- **Decision**:
  - `expiresAt` is the authoritative single timestamp, initialized to `plannedEndTime` (or extended via `PermitExtension`).
  - Active rule: `now >= expiresAt`.
  - Can `APPROVED` expire? **Yes**. If a permit is approved but the planned end time passes before the technician activates it, it automatically transitions to `EXPIRED` and cannot be activated.
  - Can `PENDING_APPROVAL` expire? **Yes**. If the planned window passes while waiting for approvals, it transitions to `EXPIRED`.
  - Can `SUSPENDED` expire? **Yes**. If conditions are not cleared before the shift/window ends, it transitions to `EXPIRED`.
  - Serverless handling: Lazy evaluation on every read/action mutation guarantees 100% correctness without relying solely on long-running node processes. A `/api/cron/expire` endpoint serves as a backstop.

---

### 6. Post-Submission Edit & Approval Invalidation Behavior
- **Decision**:
  - Edits to safety-critical fields (equipment, schedule, hazards, precautions, or `typeData`) after submission invalidate all previously granted approvals.
  - The permit's `approvalRound` increments (`round = round + 1`), and previous approvals remain associated with the prior round in the audit history.
  - If the permit was `APPROVED`, it reverts to `PENDING_APPROVAL`.
  - Every changed field logs an immutable `AuditLog` row with `field`, `fromValue`, and `toValue`.
- **Rationale**: Approving a welding permit for a 2-hour window on a pipe rack cannot remain valid if the requester quietly alters the scope to a high-pressure gas line or extends the time into the next shift.

---

### 7. Extension Policy
- **Decision**:
  - Extensions can only be requested while the permit is in `ACTIVE` state and before `expiresAt`.
  - Modeled as a separate `PermitExtension` entity.
  - Cap: Maximum of **2 extensions** per permit, and maximum total extension of **4 hours**.
  - Requires explicit re-approval by a `SAFETY_OFFICER`.
  - Once approved, `expiresAt` is updated and an audit entry is recorded.
- **Rationale**: Uncapped extensions lead to "infinite permits" that bypass shift handover safety reviews.

---

### 8. Plant Timezone Handling
- **Decision**: Standardize plant operations on **India Standard Time (IST, UTC+5:30)**.
- **Rationale**: Both seed plants (Chennai Petrochemicals Complex and Ennore Thermal Power Station) operate in Tamil Nadu, India. Shift timings and validity windows reflect local plant floor clocks. Timestamps are stored in UTC in PostgreSQL and rendered in IST with clear timezone indicators on all UI screens.

---

### 9. Conflict Detection Behavior: Warning vs Blocking
- **Decision**: Spatial-temporal overlap between `HOT_WORK` and `CONFINED_SPACE_ENTRY` triggers a **Prominent Hazard Warning** with mandatory acknowledgement rather than a hard hardcoded system block.
- **Rationale**: In real industrial plants, simultaneous operations (SIMOPS) may occur in the same broad area if separated by physical barriers or safety curtains under special variance. The system must actively alert both approvers and log the conflict acknowledgement in the audit trail.

---

### 10. QR Code Visibility & Scanning
- **Decision**: Every permit detail view includes a generated QR code encoding the permit's permanent URL (`/permits/[id]`). Scanning opens the mobile-optimized permit inspection view.
- **Rationale**: Allows safety auditors on walking rounds with mobile devices to instantly scan physical printouts or posted tablets and verify live permit status.
