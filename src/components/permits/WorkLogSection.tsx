"use client";

import React, { useState } from "react";
import { Plus, Loader2, AlertTriangle, ClipboardList } from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { formatDateTime } from "@/lib/utils/formatters";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WorkLog {
  id: string;
  description: string;
  performedAt: string;
  loggedAt: string;
  loggedBy?: {
    id: string;
    name: string;
    role: string;
  } | null;
}

interface WorkLogSectionProps {
  permitId: string;
  logs: WorkLog[];
  canAdd: boolean;
  onAdded: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WorkLogSection({
  permitId,
  logs,
  canAdd,
  onAdded,
}: WorkLogSectionProps) {
  const [showForm, setShowForm] = useState(false);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) {
      setError("Description is required.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await api.post(`/api/permits/${permitId}/work-logs`, {
        description: description.trim(),
      });
      setDescription("");
      setShowForm(false);
      onAdded();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Failed to add work log. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Add form */}
      {canAdd && (
        <div>
          {showForm ? (
            <form onSubmit={handleSubmit} className="space-y-3">
              <textarea
                id="work-log-description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={loading}
                placeholder="Describe the work performed, progress made, or observations..."
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-sky-500/60 resize-none disabled:opacity-50"
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
                  id="work-log-submit"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 text-xs font-bold transition-colors shadow-xs disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Plus size={12} />
                  )}
                  Add Log Entry
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setError(null);
                    setDescription("");
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
              id="work-log-add"
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-600 text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              <Plus size={13} />
              Log Work Progress
            </button>
          )}
        </div>
      )}

      {/* Log list */}
      {logs.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-zinc-400 dark:text-zinc-500">
          <ClipboardList size={28} strokeWidth={1.5} />
          <p className="text-xs">No work logs recorded yet.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {logs.map((log) => (
            <li
              key={log.id}
              className="p-3 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40"
            >
              <p className="text-xs text-zinc-800 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap">
                {log.description}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400 dark:text-zinc-500">
                <span>
                  Performed: <span className="font-medium">{formatDateTime(log.performedAt)}</span>
                </span>
                {log.loggedBy && (
                  <span>
                    • Logged by{" "}
                    <span className="font-medium text-zinc-600 dark:text-zinc-300">
                      {log.loggedBy.name}
                    </span>
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
