import React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PermitTypeBadge } from "@/components/ui/PermitTypeBadge";
import { formatDateTime } from "@/lib/utils/formatters";
import { EmptyState } from "@/components/ui/EmptyState";
import { DashboardPermitItem } from "./ExpiringBanner";

interface PermitTableProps {
  permits: DashboardPermitItem[];
  emptyMessage?: string;
  onClearFilters?: () => void;
}

export function PermitTable({
  permits,
  emptyMessage = "No permits found matching your filter criteria.",
  onClearFilters,
}: PermitTableProps) {
  if (!permits || permits.length === 0) {
    return (
      <EmptyState
        title="No Permits Found"
        description={emptyMessage}
        action={
          onClearFilters
            ? {
                label: "Clear All Filters",
                onClick: onClearFilters,
              }
            : undefined
        }
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xs">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-zinc-600 dark:text-zinc-400">
          <thead className="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-900 dark:text-zinc-100 font-bold uppercase tracking-wider text-[10px] border-b border-zinc-200 dark:border-zinc-800">
            <tr>
              <th scope="col" className="py-3 px-4">
                Permit #
              </th>
              <th scope="col" className="py-3 px-4">
                Type
              </th>
              <th scope="col" className="py-3 px-4">
                Status
              </th>
              <th scope="col" className="py-3 px-4">
                Equipment & Location
              </th>
              <th scope="col" className="py-3 px-4">
                Work Scope
              </th>
              <th scope="col" className="py-3 px-4">
                Lead / Requester
              </th>
              <th scope="col" className="py-3 px-4">
                Planned Schedule
              </th>
              <th scope="col" className="py-3 px-4 text-right">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {permits.map((permit) => (
              <tr
                key={permit.id}
                className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors"
              >
                <td className="py-3 px-4 font-mono font-bold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                  <Link
                    href={`/permits/${permit.id}`}
                    className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors underline-offset-2 hover:underline"
                  >
                    {permit.permitNumber}
                  </Link>
                </td>

                <td className="py-3 px-4 whitespace-nowrap">
                  <PermitTypeBadge type={permit.type} size="sm" />
                </td>

                <td className="py-3 px-4 whitespace-nowrap">
                  <StatusBadge status={permit.status} size="sm" />
                </td>

                <td className="py-3 px-4 whitespace-nowrap">
                  <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {permit.equipment?.name || "Equipment"}
                  </div>
                  <div className="text-[10px] text-zinc-500 font-mono">
                    {permit.equipment?.tagNumber} • {permit.equipment?.area?.name}
                  </div>
                </td>

                <td className="py-3 px-4 max-w-xs">
                  <p className="truncate text-zinc-800 dark:text-zinc-200 font-medium" title={permit.workDescription}>
                    {permit.workDescription}
                  </p>
                </td>

                <td className="py-3 px-4 whitespace-nowrap">
                  <div className="font-medium text-zinc-800 dark:text-zinc-200">
                    {permit.requester?.name}
                  </div>
                </td>

                <td className="py-3 px-4 whitespace-nowrap text-[11px]">
                  <div className="text-zinc-700 dark:text-zinc-300">
                    {formatDateTime(permit.plannedStartTime)}
                  </div>
                  <div className="text-[10px] text-zinc-400">
                    until {formatDateTime(permit.plannedEndTime)}
                  </div>
                </td>

                <td className="py-3 px-4 text-right whitespace-nowrap">
                  <Link
                    href={`/permits/${permit.id}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors shadow-2xs"
                  >
                    <span>View</span>
                    <ArrowUpRight size={13} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
