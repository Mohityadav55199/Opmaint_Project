"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  FileEdit,
  MapPin,
  AlertTriangle,
  Shield,
  Wrench,
  ClipboardList,
  Users,
  History,
  CheckSquare,
  Loader2,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PermitHeader } from "@/components/permits/PermitHeader";
import { ActionPanel, AvailableAction } from "@/components/permits/ActionPanel";
import { ApprovalSection, ApprovalSlot } from "@/components/permits/ApprovalSection";
import { AuditTimeline, AuditEntry } from "@/components/permits/AuditTimeline";
import { WorkLogSection, WorkLog } from "@/components/permits/WorkLogSection";
import { EntryExitSection, EntryExitLog } from "@/components/permits/EntryExitSection";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PermitTypeBadge } from "@/components/ui/PermitTypeBadge";
import { api, ApiError } from "@/lib/api/client";
import { formatDateTime, formatDate, formatPermitType } from "@/lib/utils/formatters";

// ── Types ──────────────────────────────────────────────────────────────────────

interface PermitDetail {
  id: string;
  permitNumber: string;
  type: string;
  status: string;
  contractorTeam: string;
  workDescription: string;
  plannedStartTime: string;
  plannedEndTime: string;
  expiresAt: string | null;
  actualStartTime: string | null;
  actualEndTime: string | null;
  hazards: string[];
  ppeRequired: string[];
  precautionsChecklist: Record<string, boolean>;
  typeData: Record<string, unknown>;
  rejectionReason: string | null;
  suspensionReason: string | null;
  cancellationReason: string | null;
  workCompletionNotes: string | null;
  closureVerifiedNotes: string | null;
  createdAt: string;
  updatedAt: string;
  requester: {
    id: string;
    name: string;
    email: string;
    role: string;
  } | null;
  equipment: {
    id: string;
    tagNumber: string;
    name: string;
    criticality: string;
    area: {
      id: string;
      code: string;
      name: string;
      owner: { id: string; name: string; email: string; role: string } | null;
      plant: { id: string; code: string; name: string; timezone: string } | null;
    } | null;
  } | null;
  approvals: Array<{
    id: string;
    round: number;
    slot: string;
    approverId: string | null;
    decision: string;
    comment: string | null;
    createdAt: string;
    approver: { id: string; name: string; email: string; role: string } | null;
  }>;
  auditLogs: Array<{
    id: string;
    actorId: string | null;
    actorLabel: string | null;
    actorRole: string | null;
    action: string;
    comment: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: string;
  }>;
  workLogs: Array<{
    id: string;
    description: string;
    performedAt: string;
    createdAt: string;
    author: { id: string; name: string; email: string; role: string } | null;
  }>;
  entryExitLogs: Array<{
    id: string;
    direction: "ENTRY" | "EXIT";
    personName: string;
    at: string;
    createdAt: string;
    recordedBy: { id: string; name: string; email: string; role: string } | null;
  }>;
}

interface ActionsResponse {
  permitId: string;
  status: string;
  type: string;
  actions: string[];
  details: Array<{ action: string; allowed: boolean }>;
}

// ── Section wrapper ────────────────────────────────────────────────────────────

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800">
        <span className="text-zinc-500 dark:text-zinc-400">{icon}</span>
        <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
          {title}
        </h2>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

// ── Tag lists ─────────────────────────────────────────────────────────────────

function TagList({ items, color }: { items: string[]; color?: string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
            color ??
            "bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300"
          }`}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

// ── Meta row ──────────────────────────────────────────────────────────────────

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-1 text-xs">
      <span className="w-36 shrink-0 font-semibold text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
      <span className="text-zinc-800 dark:text-zinc-200">{value || "—"}</span>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function PermitDetailPage() {
  const params = useParams();
  const router = useRouter();
  const permitId = params?.id as string;

  const [permit, setPermit] = useState<PermitDetail | null>(null);
  const [actionsData, setActionsData] = useState<ActionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!permitId) return;
    let cancelled = false;

    try {
      const [permitRes, actionsRes] = await Promise.all([
        api.get<{ data: PermitDetail }>(`/api/permits/${permitId}`),
        api.get<{ data: ActionsResponse }>(`/api/permits/${permitId}/actions`),
      ]);

      if (!cancelled) {
        setPermit(permitRes.data);
        setActionsData(actionsRes.data);
        setError(null);
        setLoading(false);
      }
    } catch (err) {
      if (!cancelled) {
        if (err instanceof ApiError && err.status === 404) {
          router.replace("/permits");
          return;
        }
        setError(
          err instanceof Error ? err.message : "Failed to load permit details."
        );
        setLoading(false);
      }
    }

    return () => {
      cancelled = true;
    };
  }, [permitId, router]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!permitId) return;
      try {
        const [permitRes, actionsRes] = await Promise.all([
          api.get<{ data: PermitDetail }>(`/api/permits/${permitId}`),
          api.get<{ data: ActionsResponse }>(`/api/permits/${permitId}/actions`),
        ]);

        if (!cancelled) {
          setPermit(permitRes.data);
          setActionsData(actionsRes.data);
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiError && err.status === 404) {
            router.replace("/permits");
            return;
          }
          setError(
            err instanceof Error ? err.message : "Failed to load permit details."
          );
          setLoading(false);
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [permitId, router]);

  function handleActionSuccess() {
    // Reload both permit and actions
    setLoading(true);
    load();
  }

  // ── Loading state ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-zinc-400">
          <Loader2 size={32} className="animate-spin" strokeWidth={1.5} />
          <p className="text-xs">Loading permit details...</p>
        </div>
      </AppShell>
    );
  }

  if (error || !permit) {
    return (
      <AppShell>
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <AlertTriangle size={32} className="text-rose-500" strokeWidth={1.5} />
          <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            {error ?? "Permit not found."}
          </p>
          <Link
            href="/permits"
            className="text-xs font-semibold text-sky-600 hover:underline"
          >
            Back to Permit Registry
          </Link>
        </div>
      </AppShell>
    );
  }

  // ── Map API data → component props ───────────────────────────────────────────

  const availableActions: AvailableAction[] = (actionsData?.actions ?? [])
    .filter((a) => a !== "EDIT" && a !== "LOG_WORK" && a !== "LOG_ENTRY_EXIT")
    .map((a) => ({
      action: a,
      label: actionLabel(a),
      description: actionDescription(a),
    }));

  const canEdit = actionsData?.actions.includes("EDIT") ?? false;
  const canLogWork = actionsData?.actions.includes("LOG_WORK") ?? false;
  const canLogEntryExit = actionsData?.actions.includes("LOG_ENTRY_EXIT") ?? false;
  const isConfinedSpace = permit.type === "CONFINED_SPACE_ENTRY";

  // Map approval slots
  const approvalSlots: ApprovalSlot[] = permit.approvals.map((a) => ({
    id: a.id,
    role: a.slot as "AREA_OWNER" | "SAFETY_OFFICER",
    status:
      a.decision === "APPROVED"
        ? "APPROVED"
        : a.decision === "REJECTED"
        ? "REJECTED"
        : "PENDING",
    approvedAt: a.decision === "APPROVED" ? a.createdAt : null,
    rejectedAt: a.decision === "REJECTED" ? a.createdAt : null,
    comment: a.comment,
    approver: a.approver,
  }));

  // Map audit entries
  const auditEntries: AuditEntry[] = permit.auditLogs.map((log) => ({
    id: log.id,
    action: log.action,
    performedAt: log.createdAt,
    actor: log.actorId
      ? {
          id: log.actorId,
          name: log.actorLabel ?? "Unknown",
          role: log.actorRole ?? "",
        }
      : null,
    actorId: log.actorId,
    comment: log.comment,
    metadata: log.metadata,
  }));

  // Map work logs
  const workLogs: WorkLog[] = permit.workLogs.map((wl) => ({
    id: wl.id,
    description: wl.description,
    performedAt: wl.performedAt,
    loggedAt: wl.createdAt,
    loggedBy: wl.author,
  }));

  // Map entry/exit logs
  const entryExitLogs: EntryExitLog[] = permit.entryExitLogs.map((el) => ({
    id: el.id,
    direction: el.direction,
    personName: el.personName,
    at: el.at,
    loggedAt: el.createdAt,
    loggedBy: el.recordedBy,
  }));

  const plant = permit.equipment?.area?.plant;
  const area = permit.equipment?.area;

  return (
    <AppShell>
      {/* Permit header banner */}
      <PermitHeader
        permit={{
          id: permit.id,
          permitNumber: permit.permitNumber,
          type: permit.type,
          status: permit.status,
          workDescription: permit.workDescription,
          plannedStartTime: permit.plannedStartTime,
          plannedEndTime: permit.plannedEndTime,
          expiresAt: permit.expiresAt,
          contractorTeam: permit.contractorTeam,
        }}
      />

      {/* Edit link for DRAFT permits */}
      {canEdit && (
        <div className="mb-4">
          <Link
            href={`/permits/${permit.id}/edit`}
            id="permit-edit-link"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-600 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
          >
            <FileEdit size={13} />
            Edit Draft
          </Link>
        </div>
      )}

      {/* Action Panel — workflow buttons driven by backend /actions */}
      {availableActions.length > 0 && (
        <div className="mb-6">
          <ActionPanel
            permitId={permit.id}
            actions={availableActions}
            onActionSuccess={handleActionSuccess}
          />
        </div>
      )}

      {/* Rejection / Suspension / Cancellation reasons */}
      {permit.rejectionReason && (
        <div className="mb-4 flex items-start gap-2 p-4 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900/50">
          <AlertTriangle size={14} className="text-red-500 mt-0.5 shrink-0" />
          <div className="text-xs">
            <span className="font-bold text-red-700 dark:text-red-400">Rejection reason: </span>
            <span className="text-red-800 dark:text-red-300">{permit.rejectionReason}</span>
          </div>
        </div>
      )}
      {permit.suspensionReason && permit.status === "SUSPENDED" && (
        <div className="mb-4 flex items-start gap-2 p-4 rounded-xl border border-orange-200 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-900/50">
          <AlertTriangle size={14} className="text-orange-500 mt-0.5 shrink-0" />
          <div className="text-xs">
            <span className="font-bold text-orange-700 dark:text-orange-400">Suspension reason: </span>
            <span className="text-orange-800 dark:text-orange-300">{permit.suspensionReason}</span>
          </div>
        </div>
      )}
      {permit.cancellationReason && (
        <div className="mb-4 flex items-start gap-2 p-4 rounded-xl border border-stone-200 bg-stone-50 dark:bg-stone-950/30 dark:border-stone-800">
          <AlertTriangle size={14} className="text-stone-500 mt-0.5 shrink-0" />
          <div className="text-xs">
            <span className="font-bold text-stone-700 dark:text-stone-400">Cancellation reason: </span>
            <span className="text-stone-700 dark:text-stone-300">{permit.cancellationReason}</span>
          </div>
        </div>
      )}
      {permit.workCompletionNotes && (
        <div className="mb-4 flex items-start gap-2 p-4 rounded-xl border border-indigo-200 bg-indigo-50 dark:bg-indigo-950/30 dark:border-indigo-900/50">
          <CheckSquare size={14} className="text-indigo-500 mt-0.5 shrink-0" />
          <div className="text-xs">
            <span className="font-bold text-indigo-700 dark:text-indigo-400">Work completion notes: </span>
            <span className="text-indigo-800 dark:text-indigo-300">{permit.workCompletionNotes}</span>
          </div>
        </div>
      )}

      {/* Two-column grid layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* LEFT — main content */}
        <div className="lg:col-span-2 space-y-5">
          {/* ── Permit Information ─────────────────────────────────── */}
          <Section icon={<ClipboardList size={14} />} title="Permit Information">
            <div className="space-y-2.5">
              <MetaRow
                label="Permit Type"
                value={
                  <span className="flex items-center gap-1.5">
                    <PermitTypeBadge type={permit.type} />
                    {formatPermitType(permit.type)}
                  </span>
                }
              />
              <MetaRow
                label="Status"
                value={<StatusBadge status={permit.status} />}
              />
              <MetaRow label="Permit Number" value={
                <span className="font-mono font-bold">{permit.permitNumber}</span>
              } />
              <MetaRow label="Contractor Team" value={permit.contractorTeam} />
              <MetaRow label="Planned Start" value={formatDateTime(permit.plannedStartTime)} />
              <MetaRow label="Planned End" value={formatDateTime(permit.plannedEndTime)} />
              {permit.expiresAt && (
                <MetaRow label="Expires At" value={formatDateTime(permit.expiresAt)} />
              )}
              {permit.actualStartTime && (
                <MetaRow label="Actual Start" value={formatDateTime(permit.actualStartTime)} />
              )}
              {permit.actualEndTime && (
                <MetaRow label="Actual End" value={formatDateTime(permit.actualEndTime)} />
              )}
              <MetaRow label="Created" value={formatDate(permit.createdAt)} />
              <MetaRow label="Requester" value={
                permit.requester
                  ? `${permit.requester.name} (${permit.requester.email})`
                  : "Unknown"
              } />
            </div>
          </Section>

          {/* ── Location ───────────────────────────────────────────── */}
          {permit.equipment && (
            <Section icon={<MapPin size={14} />} title="Location & Equipment">
              <div className="space-y-2.5">
                <MetaRow label="Plant" value={plant ? `${plant.code} — ${plant.name}` : "—"} />
                <MetaRow label="Area" value={area ? `${area.code} — ${area.name}` : "—"} />
                <MetaRow
                  label="Area Owner"
                  value={area?.owner ? area.owner.name : "—"}
                />
                <MetaRow
                  label="Equipment"
                  value={`${permit.equipment.tagNumber} — ${permit.equipment.name}`}
                />
                <MetaRow label="Criticality" value={permit.equipment.criticality} />
              </div>
            </Section>
          )}

          {/* ── Safety ─────────────────────────────────────────────── */}
          <Section icon={<Shield size={14} />} title="Safety Information">
            <div className="space-y-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">
                  Identified Hazards
                </p>
                <TagList
                  items={permit.hazards}
                  color="bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-950/30 dark:border-rose-900/50 dark:text-rose-300"
                />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">
                  PPE Required
                </p>
                <TagList
                  items={permit.ppeRequired}
                  color="bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-900/50 dark:text-amber-300"
                />
              </div>
              {Object.keys(permit.precautionsChecklist).length > 0 && (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">
                    Precautions Checklist
                  </p>
                  <ul className="space-y-1">
                    {Object.entries(permit.precautionsChecklist).map(
                      ([item, checked]) => (
                        <li key={item} className="flex items-center gap-2 text-xs">
                          <span
                            className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                              checked
                                ? "bg-emerald-500 border-emerald-500 text-white"
                                : "border-zinc-300 dark:border-zinc-600"
                            }`}
                          >
                            {checked && (
                              <svg viewBox="0 0 10 10" className="w-2.5 h-2.5" fill="none">
                                <path
                                  d="M1.5 5L4 7.5L8.5 2.5"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            )}
                          </span>
                          <span
                            className={
                              checked
                                ? "text-zinc-700 dark:text-zinc-300"
                                : "text-zinc-400 dark:text-zinc-500 line-through"
                            }
                          >
                            {item}
                          </span>
                        </li>
                      )
                    )}
                  </ul>
                </div>
              )}
            </div>
          </Section>

          {/* ── Type-Specific Data ─────────────────────────────────── */}
          {permit.typeData && Object.keys(permit.typeData).length > 0 && (
            <Section icon={<Wrench size={14} />} title={`${formatPermitType(permit.type)} — Type-Specific Data`}>
              <div className="space-y-2.5">
                {Object.entries(permit.typeData).map(([key, value]) => (
                  <MetaRow
                    key={key}
                    label={key
                      .replace(/([A-Z])/g, " $1")
                      .replace(/^./, (c) => c.toUpperCase())}
                    value={
                      typeof value === "boolean"
                        ? value
                          ? "Yes"
                          : "No"
                        : Array.isArray(value)
                        ? (value as string[]).join(", ")
                        : String(value ?? "—")
                    }
                  />
                ))}
              </div>
            </Section>
          )}

          {/* ── Work Logs ─────────────────────────────────────────── */}
          <Section icon={<ClipboardList size={14} />} title="Work Logs">
            <WorkLogSection
              permitId={permit.id}
              logs={workLogs}
              canAdd={canLogWork}
              onAdded={handleActionSuccess}
            />
          </Section>

          {/* ── Confined Space Entry/Exit ──────────────────────────── */}
          {isConfinedSpace && (
            <Section icon={<Users size={14} />} title="Confined Space — Entry / Exit Log">
              <EntryExitSection
                permitId={permit.id}
                logs={entryExitLogs}
                canAdd={canLogEntryExit}
                onAdded={handleActionSuccess}
              />
            </Section>
          )}
        </div>

        {/* RIGHT — approval & audit */}
        <div className="space-y-5">
          {/* ── Approval Status ────────────────────────────────────── */}
          <Section icon={<CheckSquare size={14} />} title="Approval Status">
            <ApprovalSection slots={approvalSlots} />
          </Section>

          {/* ── Audit Trail ───────────────────────────────────────── */}
          <Section icon={<History size={14} />} title="Audit Trail">
            <AuditTimeline entries={[...auditEntries].reverse()} />
          </Section>
        </div>
      </div>
    </AppShell>
  );
}

// ── Label helpers ──────────────────────────────────────────────────────────────

function actionLabel(action: string): string {
  switch (action) {
    case "SUBMIT":
      return "Submit for Approval";
    case "APPROVE":
      return "Approve";
    case "REJECT":
      return "Reject";
    case "ACTIVATE":
      return "Activate";
    case "SUSPEND":
      return "Suspend Work";
    case "RESUME":
      return "Resume Work";
    case "CANCEL":
      return "Cancel Permit";
    case "CLOSE":
      return "Close Permit";
    case "VERIFY_CLOSURE":
      return "Verify Closure";
    default:
      return action.replace(/_/g, " ");
  }
}

function actionDescription(action: string): string {
  switch (action) {
    case "SUBMIT":
      return "Send this permit into the multi-role approval workflow.";
    case "APPROVE":
      return "Grant approval for your assigned slot.";
    case "REJECT":
      return "Reject the permit with a documented safety justification.";
    case "ACTIVATE":
      return "Authorize work to begin. The permit validity timer starts now.";
    case "SUSPEND":
      return "Temporarily halt all work. Requires a documented reason.";
    case "RESUME":
      return "Lift the suspension and re-authorize work.";
    case "CANCEL":
      return "Permanently cancel this permit. This action cannot be undone.";
    case "CLOSE":
      return "Mark work as complete and initiate safety closure.";
    case "VERIFY_CLOSURE":
      return "Inspect the site and formally verify the permit closure.";
    default:
      return "";
  }
}
