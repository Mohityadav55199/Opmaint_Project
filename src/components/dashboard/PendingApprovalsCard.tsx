import React from "react";
import Link from "next/link";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { PermitTypeBadge } from "@/components/ui/PermitTypeBadge";
import { formatDateTime } from "@/lib/utils/formatters";
import { DashboardPermitItem } from "./ExpiringBanner";

interface PendingApprovalsCardProps {
  permits: DashboardPermitItem[];
}

export function PendingApprovalsCard({ permits }: PendingApprovalsCardProps) {
  if (!permits || permits.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20 p-4 shadow-xs">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="text-blue-600 dark:text-blue-400" size={20} />
          <div>
            <h3 className="text-sm font-bold text-blue-950 dark:text-blue-200">
              Pending Your Approval ({permits.length})
            </h3>
            <p className="text-xs text-blue-700 dark:text-blue-300">
              You hold an unfulfilled approval obligation as Area Owner or Safety Officer for these permits.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {permits.map((permit) => (
          <div
            key={permit.id}
            className="flex flex-col justify-between p-3.5 rounded-lg border border-blue-100 dark:border-blue-900/50 bg-white dark:bg-zinc-900 shadow-2xs"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="font-mono text-xs font-bold text-zinc-900 dark:text-zinc-100">
                  {permit.permitNumber}
                </span>
                <PermitTypeBadge type={permit.type} size="sm" />
              </div>

              <p className="text-xs text-zinc-800 dark:text-zinc-200 font-semibold line-clamp-2 mb-2">
                {permit.workDescription}
              </p>

              <div className="text-[11px] text-zinc-500 dark:text-zinc-400 space-y-1">
                <div>
                  <span className="font-medium text-zinc-600 dark:text-zinc-300">Equipment:</span>{" "}
                  {permit.equipment.name} ({permit.equipment.tagNumber})
                </div>
                <div>
                  <span className="font-medium text-zinc-600 dark:text-zinc-300">Area:</span>{" "}
                  {permit.equipment.area.name} ({permit.equipment.area.code})
                </div>
                <div>
                  <span className="font-medium text-zinc-600 dark:text-zinc-300">Submitted by:</span>{" "}
                  {permit.requester.name}
                </div>
                <div>
                  <span className="font-medium text-zinc-600 dark:text-zinc-300">Planned Start:</span>{" "}
                  {formatDateTime(permit.plannedStartTime)}
                </div>
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-end">
              <Link
                href={`/permits/${permit.id}`}
                className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-2xs"
              >
                <span>Review & Sign Off</span>
                <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
