import React from "react";
import Link from "next/link";
import { ArrowLeft, Clock, AlertTriangle, CheckCircle } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PermitTypeBadge } from "@/components/ui/PermitTypeBadge";
import { formatTimeRemaining, formatDateTime } from "@/lib/utils/formatters";

interface PermitHeaderProps {
  permit: {
    id: string;
    permitNumber: string;
    type: string;
    status: string;
    workDescription: string;
    plannedStartTime: string;
    plannedEndTime: string;
    expiresAt: string | null;
    isExpired?: boolean;
    isExpiringSoon?: boolean;
    contractorTeam: string;
  };
}

export function PermitHeader({ permit }: PermitHeaderProps) {
  const expiryInfo = formatTimeRemaining(permit.expiresAt || permit.plannedEndTime);

  return (
    <div className="mb-6 space-y-4">
      {/* Back button */}
      <div>
        <Link
          href="/permits"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
        >
          <ArrowLeft size={14} />
          <span>Back to Permit Registry</span>
        </Link>
      </div>

      {/* Main Header Banner */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5 mb-2">
            <span className="font-mono text-lg font-black text-zinc-950 dark:text-zinc-50 tracking-tight">
              {permit.permitNumber}
            </span>
            <PermitTypeBadge type={permit.type} size="md" />
            <StatusBadge status={permit.status} size="md" />
          </div>

          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100 max-w-2xl leading-snug">
            {permit.workDescription}
          </h2>

          <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 flex flex-wrap items-center gap-3">
            <span>
              Execution Team: <strong className="text-zinc-700 dark:text-zinc-300">{permit.contractorTeam}</strong>
            </span>
            <span>•</span>
            <span>
              Schedule: {formatDateTime(permit.plannedStartTime)} to {formatDateTime(permit.plannedEndTime)}
            </span>
          </div>
        </div>

        {/* Validity & Expiry Countdown Pill */}
        <div className="shrink-0 flex flex-col items-start md:items-end justify-center">
          {permit.status === "ACTIVE" && (
            <div
              className={`p-3 rounded-xl border flex items-center gap-2.5 ${
                expiryInfo.isPast
                  ? "bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300"
                  : expiryInfo.isWarning
                  ? "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300"
                  : "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300"
              }`}
            >
              {expiryInfo.isPast ? (
                <AlertTriangle size={18} className="text-rose-600 dark:text-rose-400" />
              ) : (
                <Clock size={18} className={expiryInfo.isWarning ? "text-amber-600 animate-pulse" : "text-emerald-600"} />
              )}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">
                  Active Validity Status
                </div>
                <div className="text-xs font-black">
                  {expiryInfo.text}
                </div>
              </div>
            </div>
          )}

          {permit.status === "EXPIRED" && (
            <div className="p-3 rounded-xl border bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300 flex items-center gap-2">
              <AlertTriangle size={18} className="text-rose-600" />
              <div className="text-xs font-bold">Permit Validity Expired</div>
            </div>
          )}

          {(permit.status === "CLOSED" || permit.status === "CLOSED_VERIFIED") && (
            <div className="p-3 rounded-xl border bg-teal-50 border-teal-200 text-teal-800 dark:bg-teal-950/40 dark:border-teal-800 dark:text-teal-300 flex items-center gap-2">
              <CheckCircle size={18} className="text-teal-600" />
              <div className="text-xs font-bold">Work Closed &amp; Verified</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
