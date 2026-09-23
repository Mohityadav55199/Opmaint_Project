"use client";

import React from "react";
import {
  Clock,
  Send,
  ThumbsUp,
  ThumbsDown,
  Zap,
  PauseCircle,
  PlayCircle,
  XCircle,
  CheckCircle2,
  ShieldCheck,
  FileEdit,
  AlertTriangle,
  UserCheck,
  Hash,
} from "lucide-react";
import { formatDateTime } from "@/lib/utils/formatters";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: string;
  action: string;
  performedAt: string;
  actor?: {
    id: string;
    name: string;
    role: string;
  } | null;
  actorId?: string | null;
  comment?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface AuditTimelineProps {
  entries: AuditEntry[];
}

// ── Icon map ──────────────────────────────────────────────────────────────────

const AUDIT_ICONS: Record<string, { icon: React.ReactNode; color: string }> = {
  CREATED: {
    icon: <FileEdit size={12} />,
    color: "bg-zinc-400 text-white",
  },
  DRAFT_UPDATED: {
    icon: <FileEdit size={12} />,
    color: "bg-zinc-400 text-white",
  },
  SUBMITTED: {
    icon: <Send size={12} />,
    color: "bg-sky-500 text-white",
  },
  APPROVED: {
    icon: <ThumbsUp size={12} />,
    color: "bg-emerald-500 text-white",
  },
  REJECTED: {
    icon: <ThumbsDown size={12} />,
    color: "bg-red-500 text-white",
  },
  ACTIVATED: {
    icon: <Zap size={12} />,
    color: "bg-violet-500 text-white",
  },
  SUSPENDED: {
    icon: <PauseCircle size={12} />,
    color: "bg-orange-500 text-white",
  },
  RESUMED: {
    icon: <PlayCircle size={12} />,
    color: "bg-teal-500 text-white",
  },
  CANCELLED: {
    icon: <XCircle size={12} />,
    color: "bg-stone-500 text-white",
  },
  CLOSED: {
    icon: <CheckCircle2 size={12} />,
    color: "bg-indigo-500 text-white",
  },
  CLOSURE_VERIFIED: {
    icon: <ShieldCheck size={12} />,
    color: "bg-teal-600 text-white",
  },
  WORK_LOGGED: {
    icon: <Hash size={12} />,
    color: "bg-zinc-400 text-white",
  },
  EXPIRED: {
    icon: <AlertTriangle size={12} />,
    color: "bg-rose-500 text-white",
  },
  ENTRY_LOGGED: {
    icon: <UserCheck size={12} />,
    color: "bg-blue-400 text-white",
  },
  EXIT_LOGGED: {
    icon: <UserCheck size={12} />,
    color: "bg-slate-400 text-white",
  },
};

function getAuditIcon(action: string) {
  return (
    AUDIT_ICONS[action] ?? {
      icon: <Clock size={12} />,
      color: "bg-zinc-400 text-white",
    }
  );
}

function humanizeAction(action: string): string {
  return action
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AuditTimeline({ entries }: AuditTimelineProps) {
  if (entries.length === 0) {
    return (
      <p className="text-xs text-zinc-500 dark:text-zinc-400 italic py-4 text-center">
        No audit events recorded yet.
      </p>
    );
  }

  return (
    <div className="relative">
      {/* Vertical rail */}
      <div className="absolute left-4 top-2 bottom-2 w-px bg-zinc-200 dark:bg-zinc-700" />

      <ul className="space-y-5 pl-10">
        {entries.map((entry) => {
          const { icon, color } = getAuditIcon(entry.action);
          const actorName =
            entry.actor?.name ??
            (entry.actorId === null ? "System" : "Unknown");

          return (
            <li key={entry.id} className="relative">
              {/* Dot on rail */}
              <span
                className={`absolute -left-6 top-0.5 flex h-5 w-5 items-center justify-center rounded-full shadow-sm ${color}`}
              >
                {icon}
              </span>

              <div>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                    {humanizeAction(entry.action)}
                  </span>
                  {actorName && (
                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      by <span className="font-semibold">{actorName}</span>
                    </span>
                  )}
                  <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                    {formatDateTime(entry.performedAt)}
                  </span>
                </div>

                {entry.comment && (
                  <p className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-300 leading-relaxed italic">
                    &ldquo;{entry.comment}&rdquo;
                  </p>
                )}

                {entry.metadata &&
                  typeof entry.metadata === "object" &&
                  Object.keys(entry.metadata).length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-2">
                      {Object.entries(entry.metadata)
                        .filter(([, v]) => v !== null && v !== undefined && v !== "")
                        .map(([k, v]) => (
                          <span
                            key={k}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 font-mono"
                          >
                            <span className="opacity-60">{k}:</span>
                            <span>{String(v)}</span>
                          </span>
                        ))}
                    </div>
                  )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
