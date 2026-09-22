# Final Requirements Traceability & Verification Checklist

This document maps every requirement from the official Opmaint Assignment PDF and Claude Architecture Review to its planned implementation file, test suite, and verification status.

---

## Legend
- `[READY_FOR_DEV]`: Architecture planned, waiting for implementation phase
- `[PASS]`: Fully implemented, verified with tests
- `[PARTIAL]`: Partially implemented with documented trade-off
- `[FAIL]`: Not meeting requirements

---

## 1. Technology Stack & Architecture
| Requirement | Planned Implementation | Planned Test / Verification | Status |
|---|---|---|---|
| Next.js App Router (Full-Stack) | `src/app/` (API routes + React pages) | Next build verification | [READY_FOR_DEV] |
| TypeScript strict mode | `tsconfig.json` | `tsc --noEmit` check | [READY_FOR_DEV] |
| Tailwind CSS & responsive UI | `src/app/globals.css`, `tailwind.config.ts` | Mobile + Desktop browser check | [READY_FOR_DEV] |
| PostgreSQL + Prisma ORM | `prisma/schema.prisma` | Migration & seed verification | [READY_FOR_DEV] |
| Single API surface under `/app/api/...` | `src/app/api/` route handlers | Vitest / Supertest API suite | [READY_FOR_DEV] |

---

## 2. Core Domain Model & Extensibility
| Requirement | Planned Implementation | Planned Test / Verification | Status |
|---|---|---|---|
| Extensible Permit model (JSONB + Registry) | `src/domain/permit-registry/` | `tests/registry.test.ts` | [READY_FOR_DEV] |
| Hot Work (welding/cutting, fire watch, gas test) | `src/domain/permit-registry/hot-work.ts` | Zod schema & validation tests | [READY_FOR_DEV] |
| Confined Space (space ID, atmospheric test, rescue plan) | `src/domain/permit-registry/confined-space.ts` | Gas test boundary tests | [READY_FOR_DEV] |
| Working at Height (height, access method, fall arrest) | `src/domain/permit-registry/height.ts` | Height schema tests | [READY_FOR_DEV] |
| Electrical LOTO (equipment tag, voltage, isolation points) | `src/domain/permit-registry/loto.ts` | LOTO schema tests | [READY_FOR_DEV] |
| Proof-of-extensibility (Dummy 5th type: Excavation) | `src/domain/permit-registry/excavation.ts` | `tests/extensibility.test.ts` (draft->activate) | [READY_FOR_DEV] |
| Relational WorkLogEntry | `prisma/schema.prisma` (`WorkLogEntry`) | `tests/work-log.test.ts` | [READY_FOR_DEV] |
| Relational EntryExitLog | `prisma/schema.prisma` (`EntryExitLog`) | `tests/entry-exit.test.ts` | [READY_FOR_DEV] |
| Relational Approval slots | `prisma/schema.prisma` (`Approval`) | `tests/approval-slots.test.ts` | [READY_FOR_DEV] |
| Relational AuditLog | `prisma/schema.prisma` (`AuditLog`) | `tests/audit.test.ts` | [READY_FOR_DEV] |
| Relational PermitExtension | `prisma/schema.prisma` (`PermitExtension`) | `tests/extension.test.ts` | [READY_FOR_DEV] |

---

## 3. Location Hierarchy & Authoritative Derivation
| Requirement | Planned Implementation | Planned Test / Verification | Status |
|---|---|---|---|
| Derive Plant & Area strictly from Equipment | `src/domain/permits/location.ts` | `tests/location-derivation.test.ts` | [READY_FOR_DEV] |
| Reject spoofed `areaId` / `plantId` | `src/app/api/permits/route.ts` | Adversarial API test | [READY_FOR_DEV] |

---

## 4. State Machine & Lifecycle Transitions
| Requirement | Planned Implementation | Planned Test / Verification | Status |
|---|---|---|---|
| DRAFT -> PENDING_APPROVAL (`SUBMIT`) | `src/domain/state-machine/transitions.ts` | Transition test | [READY_FOR_DEV] |
| PENDING_APPROVAL -> APPROVED (all slots filled) | `src/domain/state-machine/transitions.ts` | Slot completion test | [READY_FOR_DEV] |
| PENDING_APPROVAL -> REJECTED (any reject) | `src/domain/state-machine/transitions.ts` | Rejection test | [READY_FOR_DEV] |
| APPROVED -> ACTIVE (`ACTIVATE`) | `src/domain/state-machine/transitions.ts` | Timing & approval check test | [READY_FOR_DEV] |
| Reject ACTIVATE before planned start time | `src/domain/state-machine/authorization.ts` | Early activation test | [READY_FOR_DEV] |
| Reject ACTIVATE if expired | `src/domain/state-machine/authorization.ts` | Expired activation test | [READY_FOR_DEV] |
| ACTIVE -> SUSPENDED (`SUSPEND`) | `src/domain/state-machine/transitions.ts` | Suspension test | [READY_FOR_DEV] |
| SUSPENDED -> ACTIVE (`RESUME`) | `src/domain/state-machine/transitions.ts` | Resume test | [READY_FOR_DEV] |
| Auto-expiry on validity boundary (`EXPIRE`) | `src/domain/state-machine/expiry.ts` | Expiry boundary tests | [READY_FOR_DEV] |
| ACTIVE -> CLOSED (`CLOSE`) | `src/domain/state-machine/transitions.ts` | Requester close test | [READY_FOR_DEV] |
| CLOSED -> CLOSED_VERIFIED (`VERIFY`) | `src/domain/state-machine/transitions.ts` | Safety officer verify test | [READY_FOR_DEV] |
| Non-terminal -> CANCELLED (`CANCEL`) | `src/domain/state-machine/transitions.ts` | Cancellation test | [READY_FOR_DEV] |
| Reject illegal state transitions server-side (409) | `src/domain/state-machine/engine.ts` | Illegal transition suite | [READY_FOR_DEV] |

---

## 5. Roles, Approvals & Permission Enforcement
| Requirement | Planned Implementation | Planned Test / Verification | Status |
|---|---|---|---|
| 4 Roles (`REQUESTER`, `AREA_OWNER`, `SAFETY_OFFICER`, `ADMIN`) | `prisma/schema.prisma` | Role check tests | [READY_FOR_DEV] |
| Single source authorization (`checkAction`, `getAvailableActions`) | `src/domain/state-machine/authorization.ts` | Auth unit test suite | [READY_FOR_DEV] |
| Zero Self-Approval rule (Requester cannot approve) | `src/domain/approvals/slots.ts` | Self-approval test (must 403) | [READY_FOR_DEV] |
| Admin cannot bypass self-approval | `src/domain/approvals/slots.ts` | Admin self-approval test | [READY_FOR_DEV] |
| Area Owner restricted to their assigned area | `src/domain/approvals/slots.ts` | Cross-area approval test (403) | [READY_FOR_DEV] |
| Safety Officer slot approval | `src/domain/approvals/slots.ts` | Safety Officer slot test | [READY_FOR_DEV] |
| One person cannot fill multiple required slots | `src/domain/approvals/slots.ts` | Duplicate slot filling test | [READY_FOR_DEV] |
| Multi-round approval tracking (`round`) | `prisma/schema.prisma` (`Approval`) | Round transition test | [READY_FOR_DEV] |
| Post-submission edits invalidate prior approvals | `src/domain/permits/edit.ts` | Invalidation on edit test | [READY_FOR_DEV] |

---

## 6. Work Logging & Safety Guards
| Requirement | Planned Implementation | Planned Test / Verification | Status |
|---|---|---|---|
| Work cannot be logged against non-ACTIVE permits | `src/app/api/permits/[id]/work-logs/route.ts` | Rejection on all non-ACTIVE states | [READY_FOR_DEV] |
| Confined Space Entry/Exit log guard | `src/app/api/permits/[id]/entry-logs/route.ts` | Non-ACTIVE rejection test | [READY_FOR_DEV] |
| Mandatory reasons for Rejection, Suspension, Cancellation | `src/domain/state-machine/transitions.ts` | Whitespace-only failure tests | [READY_FOR_DEV] |

---

## 7. Expiry, Concurrency & Security
| Requirement | Planned Implementation | Planned Test / Verification | Status |
|---|---|---|---|
| Authoritative `expiresAt` field | `prisma/schema.prisma` (`Permit`) | Boundary tests | [READY_FOR_DEV] |
| Lazy expiry on read/mutation | `src/domain/state-machine/expiry.ts` | Lazy evaluation tests | [READY_FOR_DEV] |
| Expired permit cannot be reactivated or resumed | `src/domain/state-machine/authorization.ts` | Reactivation rejection test | [READY_FOR_DEV] |
| Concurrency safety (simultaneous approvals) | Prisma transaction + unique constraint | `Promise.all` concurrent approval test | [READY_FOR_DEV] |
| Concurrency safety (double activation) | Prisma transaction with version check | `Promise.all` double activation test | [READY_FOR_DEV] |
| Database sequence for `permitNumber` (`PTW-YYYY-XXXX`) | PostgreSQL sequence / atomic counter | Concurrent creation test | [READY_FOR_DEV] |
| Immutable append-only AuditLog in same transaction | `src/domain/audit/logger.ts` | Audit generation tests | [READY_FOR_DEV] |

---

## 8. Frontend & User Experience
| Requirement | Planned Implementation | Planned Test / Verification | Status |
|---|---|---|---|
| Dashboard with filters (status, type, area, date, my pending) | `src/app/(dashboard)/page.tsx` | Filter interaction test | [READY_FOR_DEV] |
| Active now & Expiring within 2h indicator | `src/components/dashboard/ExpiringBanner.tsx` | Countdown component test | [READY_FOR_DEV] |
| Multi-step dynamic create permit form | `src/app/(dashboard)/permits/new/page.tsx` | Form submission test | [READY_FOR_DEV] |
| Permit detail screen with approval slots & timeline | `src/app/(dashboard)/permits/[id]/page.tsx` | Detail view verification | [READY_FOR_DEV] |
| Approver view with comment & canvas signature capture | `src/components/permits/ApprovalModal.tsx` | Canvas signature test | [READY_FOR_DEV] |
| Closure workflow (Requester complete + Safety verify) | `src/components/permits/ClosureModal.tsx` | Two-step closure test | [READY_FOR_DEV] |
| Mobile-first permit view (large touch targets, high contrast) | `src/app/(dashboard)/permits/[id]/mobile/page.tsx` | Mobile viewport test | [READY_FOR_DEV] |
| Admin screens for Users, Areas, Equipment | `src/app/(dashboard)/admin/page.tsx` | Admin CRUD check | [READY_FOR_DEV] |
| QR Code display on permit | `src/components/permits/PermitQrCode.tsx` | QR generation check | [READY_FOR_DEV] |
| SIMOPS Conflict Warning (Hot Work vs Confined Space) | `src/domain/conflict/detector.ts` | Conflict detection test | [READY_FOR_DEV] |

---

## 9. Seed Data & Deployment
| Requirement | Planned Implementation | Planned Test / Verification | Status |
|---|---|---|---|
| 4 Users (one per role) | `prisma/seed.ts` | `npx prisma db seed` | [READY_FOR_DEV] |
| 2 Plants + 6 Equipment items | `prisma/seed.ts` | Plant/Equipment existence test | [READY_FOR_DEV] |
| ~11 Permits across all states | `prisma/seed.ts` | State diversity test | [READY_FOR_DEV] |
| Sub-two minute cold start setup | `README.md` | Clean setup script test | [READY_FOR_DEV] |
| Vercel + Hosted PostgreSQL deployment | `.env.example`, build configuration | Production URL live verification | [READY_FOR_DEV] |
