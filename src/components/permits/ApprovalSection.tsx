"use client";

import React from "react";
import { CheckCircle2, Clock, XCircle, Shield, UserCog } from "lucide-react";
import { formatDateTime, formatRole } from "@/lib/utils/formatters";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ApprovalSlot {
  id: string;
  role: "AREA_OWNER" | "SAFETY_OFFICER";
  status: "PENDING" | "APPROVED" | "REJECTED";
  approvedAt?: string | null;
  rejectedAt?: string | null;
  comment?: string | null;
  approver?: {
    id: string;
    name: string;
    role: string;
  } | null;
}

interface ApprovalSectionProps {
  slots: ApprovalSlot[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ApprovalSection({ slots }: ApprovalSectionProps) {
  if (slots.length === 0) {
    return (
      <p className="text-xs text-zinc-500 dark:text-zinc-400 italic py-4 text-center">
        No approval slots initialized yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {slots.map((slot) => {
        const isPending = slot.status === "PENDING";
        const isApproved = slot.status === "APPROVED";
        const isRejected = slot.status === "REJECTED";

        return (
          <div
            key={slot.id}
            className={`flex items-start gap-3 p-4 rounded-xl border ${
              isApproved
                ? "border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-900/50"
                : isRejected
                ? "border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900/50"
                : "border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900/50"
            }`}
          >
            {/* Status icon */}
            <div className="shrink-0 mt-0.5">
              {isApproved && (
                <CheckCircle2
                  size={18}
                  className="text-emerald-600 dark:text-emerald-400"
                />
              )}
              {isRejected && (
                <XCircle size={18} className="text-red-600 dark:text-red-400" />
              )}
              {isPending && (
                <Clock size={18} className="text-amber-600 dark:text-amber-400" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {/* Role badge */}
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    slot.role === "SAFETY_OFFICER"
                      ? "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
                      : "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
                  }`}
                >
                  {slot.role === "SAFETY_OFFICER" ? (
                    <Shield size={9} />
                  ) : (
                    <UserCog size={9} />
                  )}
                  {formatRole(slot.role)}
                </span>

                {/* Status label */}
                <span
                  className={`text-xs font-semibold ${
                    isApproved
                      ? "text-emerald-700 dark:text-emerald-400"
                      : isRejected
                      ? "text-red-700 dark:text-red-400"
                      : "text-amber-700 dark:text-amber-400"
                  }`}
                >
                  {isApproved ? "Approved" : isRejected ? "Rejected" : "Awaiting Review"}
                </span>
              </div>

              {/* Approver & timestamp */}
              {slot.approver && (
                <p className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-300">
                  by{" "}
                  <span className="font-semibold">{slot.approver.name}</span>
                  {(slot.approvedAt || slot.rejectedAt) && (
                    <span className="text-zinc-400 dark:text-zinc-500">
                      {" "}
                      • {formatDateTime(slot.approvedAt ?? slot.rejectedAt)}
                    </span>
                  )}
                </p>
              )}

              {/* Comment */}
              {slot.comment && (
                <p className="mt-1.5 text-[11px] text-zinc-600 dark:text-zinc-300 italic leading-relaxed">
                  &ldquo;{slot.comment}&rdquo;
                </p>
              )}

              {isPending && (
                <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                  Waiting for a {formatRole(slot.role)} to review this permit.
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
