"use client";

import React, { useState } from "react";
import { LogIn, LogOut, Plus, Loader2, AlertTriangle, Users } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { formatDateTime } from "@/lib/utils/formatters";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EntryExitLog {
  id: string;
  direction: "ENTRY" | "EXIT";
  personName: string;
  at: string;
  loggedAt: string;
  loggedBy?: {
    id: string;
    name: string;
    role: string;
  } | null;
}

interface EntryExitSectionProps {
  permitId: string;
  logs: EntryExitLog[];
  canAdd: boolean;
  onAdded: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function EntryExitSection({
  permitId,
  logs,
  canAdd,
  onAdded,
}: EntryExitSectionProps) {
  const [showForm, setShowForm] = useState(false);
  const [direction, setDirection] = useState<"ENTRY" | "EXIT">("ENTRY");
  const [personName, setPersonName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!personName.trim()) {
      setError("Person name is required.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await api.post(`/api/permits/${permitId}/entry-logs`, {
        direction,
        personName: personName.trim(),
      });
      setPersonName("");
      setShowForm(false);
      onAdded();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Failed to add entry/exit log."
      );
    } finally {
      setLoading(false);
    }
  }

  const inSpace = logs.filter((l) => l.direction === "ENTRY").length;
  const outOfSpace = logs.filter((l) => l.direction === "EXIT").length;
  const currentlyInside = Math.max(0, inSpace - outOfSpace);

  return (
    <div className="space-y-4">
      {/* Active roster summary */}
      {logs.length > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50">
          <Users size={16} className="text-blue-500 shrink-0" />
          <div className="text-xs">
            <span className="font-bold text-blue-800 dark:text-blue-300">
              {currentlyInside}
            </span>
            <span className="text-blue-700 dark:text-blue-400">
              {" "}
              person{currentlyInside !== 1 ? "s" : ""} currently inside the confined space
            </span>
          </div>
        </div>
      )}

      {/* Add form */}
      {canAdd && (
        <div>
          {showForm ? (
            <form onSubmit={handleSubmit} className="space-y-3">
              {/* Direction toggle */}
              <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setDirection("ENTRY")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold transition-colors ${
                    direction === "ENTRY"
                      ? "bg-emerald-600 text-white"
                      : "bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                  }`}
                >
                  <LogIn size={13} />
                  Entry
                </button>
                <button
                  type="button"
                  onClick={() => setDirection("EXIT")}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold transition-colors ${
                    direction === "EXIT"
                      ? "bg-orange-500 text-white"
                      : "bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                  }`}
                >
                  <LogOut size={13} />
                  Exit
                </button>
              </div>

              <input
                id="entry-exit-person"
                type="text"
                value={personName}
                onChange={(e) => setPersonName(e.target.value)}
                disabled={loading}
                placeholder="Full name of person entering or exiting..."
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-sky-500/60 disabled:opacity-50"
              />

              {error && (
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-xs text-red-700 dark:text-red-300">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                  {error}
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  id="entry-exit-submit"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 text-xs font-bold transition-colors shadow-xs disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Plus size={12} />
                  )}
                  Record {direction === "ENTRY" ? "Entry" : "Exit"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setError(null);
                    setPersonName("");
                  }}
                  disabled={loading}
                  className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              id="entry-exit-add"
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-600 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              <Plus size={13} />
              Record Entry / Exit
            </button>
          )}
        </div>
      )}

      {/* Log list */}
      {logs.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-zinc-400 dark:text-zinc-500">
          <Users size={28} strokeWidth={1.5} />
          <p className="text-xs">No entry/exit records yet.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {logs.map((log) => (
            <li
              key={log.id}
              className={`flex items-start gap-3 p-3 rounded-xl border ${
                log.direction === "ENTRY"
                  ? "border-emerald-100 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/20"
                  : "border-orange-100 dark:border-orange-900/50 bg-orange-50 dark:bg-orange-950/20"
              }`}
            >
              <div
                className={`mt-0.5 shrink-0 ${
                  log.direction === "ENTRY"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-orange-600 dark:text-orange-400"
                }`}
              >
                {log.direction === "ENTRY" ? (
                  <LogIn size={14} />
                ) : (
                  <LogOut size={14} />
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  {log.personName}
                </p>
                <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400 flex flex-wrap gap-2">
                  <span className="font-medium">
                    {log.direction === "ENTRY" ? "Entered" : "Exited"} at{" "}
                    {formatDateTime(log.at)}
                  </span>
                  {log.loggedBy && (
                    <span>• Logged by {log.loggedBy.name}</span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
