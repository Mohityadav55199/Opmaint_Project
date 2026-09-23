import React from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, Clock } from "lucide-react";
import { formatTimeRemaining } from "@/lib/utils/formatters";
import { PermitTypeBadge } from "@/components/ui/PermitTypeBadge";

export interface DashboardPermitItem {
  id: string;
  permitNumber: string;
  type: string;
  status: string;
  workDescription: string;
  expiresAt: string | null;
  plannedStartTime: string;
  plannedEndTime: string;
  equipment: {
    id: string;
    tagNumber: string;
    name: string;
    area: {
      id: string;
      code: string;
      name: string;
      plant: {
        id: string;
        code: string;
        name: string;
      };
    };
  };
  requester: {
    id: string;
    name: string;
    email: string;
  };
}

interface ExpiringBannerProps {
  expiringPermits: DashboardPermitItem[];
}

export function ExpiringBanner({ expiringPermits }: ExpiringBannerProps) {
  if (!expiringPermits || expiringPermits.length === 0) return null;

  return (
    <div className="mb-6 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 p-4 shadow-xs">
      <div className="flex items-center gap-2 mb-3">
        <AlertCircle className="text-amber-600 dark:text-amber-400 shrink-0" size={20} />
        <div>
          <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">
            Safety Alert: {expiringPermits.length} Permit{expiringPermits.length > 1 ? "s" : ""} Expiring Within 2 Hours
          </h3>
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Active work must be completed and formally closed before validity expires, or safety review is required.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {expiringPermits.map((permit) => {
          const timeInfo = formatTimeRemaining(permit.expiresAt || permit.plannedEndTime);
          return (
            <div
              key={permit.id}
              className="flex flex-col justify-between p-3 rounded-lg border border-amber-200 dark:border-amber-800/60 bg-white/90 dark:bg-zinc-900/90 shadow-2xs"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="font-mono text-xs font-bold text-zinc-900 dark:text-zinc-100">
                    {permit.permitNumber}
                  </span>
                  <PermitTypeBadge type={permit.type} size="sm" />
                </div>

                <p className="text-xs text-zinc-600 dark:text-zinc-300 line-clamp-1 mb-2 font-medium">
                  {permit.workDescription}
                </p>

                <div className="text-[11px] text-zinc-500 dark:text-zinc-400 space-y-0.5">
                  <div>
                    <strong className="text-zinc-700 dark:text-zinc-300">Location:</strong>{" "}
                    {permit.equipment.name} ({permit.equipment.tagNumber}) • {permit.equipment.area.name}
                  </div>
                  <div>
                    <strong className="text-zinc-700 dark:text-zinc-300">Lead:</strong>{" "}
                    {permit.requester.name}
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-amber-100 dark:border-zinc-800 flex items-center justify-between">
                <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 dark:text-amber-400">
                  <Clock size={13} />
                  <span>{timeInfo.text}</span>
                </span>

                <Link
                  href={`/permits/${permit.id}`}
                  className="inline-flex items-center gap-1 text-xs font-bold text-zinc-900 dark:text-zinc-100 hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                >
                  <span>View Details</span>
                  <ArrowRight size={13} />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
