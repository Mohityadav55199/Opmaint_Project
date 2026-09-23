"use client";

import React, { useState } from "react";
import {
  Send,
  ThumbsUp,
  ThumbsDown,
  Zap,
  PauseCircle,
  PlayCircle,
  XCircle,
  CheckCircle2,
  ShieldCheck,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

// ── Types ────────────────────────────────────────────────────────────────────

export interface AvailableAction {
  action: string;
  label: string;
  description?: string;
}

interface ActionPanelProps {
  permitId: string;
  actions: AvailableAction[];
  onActionSuccess: () => void;
}

// ── Icon map ─────────────────────────────────────────────────────────────────

const ACTION_ICONS: Record<string, React.ReactNode> = {
  SUBMIT: <Send size={14} />,
  APPROVE: <ThumbsUp size={14} />,
  REJECT: <ThumbsDown size={14} />,
  ACTIVATE: <Zap size={14} />,
  SUSPEND: <PauseCircle size={14} />,
  RESUME: <PlayCircle size={14} />,
  CANCEL: <XCircle size={14} />,
  CLOSE: <CheckCircle2 size={14} />,
  VERIFY_CLOSURE: <ShieldCheck size={14} />,
};

const ACTION_VARIANTS: Record<string, string> = {
  SUBMIT:
    "bg-sky-600 hover:bg-sky-700 text-white",
  APPROVE:
    "bg-emerald-600 hover:bg-emerald-700 text-white",
  REJECT:
    "bg-red-600 hover:bg-red-700 text-white",
  ACTIVATE:
    "bg-violet-600 hover:bg-violet-700 text-white",
  SUSPEND:
    "bg-orange-500 hover:bg-orange-600 text-white",
  RESUME:
    "bg-teal-600 hover:bg-teal-700 text-white",
  CANCEL:
    "bg-zinc-700 hover:bg-zinc-800 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-white",
  CLOSE:
    "bg-indigo-600 hover:bg-indigo-700 text-white",
  VERIFY_CLOSURE:
    "bg-teal-600 hover:bg-teal-700 text-white",
};

// ── Action configs ────────────────────────────────────────────────────────────

interface ActionConfig {
  endpoint: string;
  requiresReason?: boolean;
  reasonLabel?: string;
  requiresComment?: boolean;
  requiresCompletionNotes?: boolean;
  requiresVerifyNotes?: boolean;
  destructive?: boolean;
  confirmTitle?: string;
  confirmBody?: string;
}

const ACTION_CONFIGS: Record<string, ActionConfig> = {
  SUBMIT: {
    endpoint: "submit",
    confirmTitle: "Submit Permit for Approval",
    confirmBody:
      "This will send the permit into the approval workflow. You will no longer be able to edit the core fields.",
  },
  APPROVE: {
    endpoint: "approve",
    requiresComment: true,
  },
  REJECT: {
    endpoint: "reject",
    requiresReason: true,
    reasonLabel: "Rejection reason (required)",
    destructive: true,
  },
  ACTIVATE: {
    endpoint: "activate",
    confirmTitle: "Activate Permit",
    confirmBody:
      "Activating the permit authorizes work to begin immediately. The expiry timer will start.",
  },
  SUSPEND: {
    endpoint: "suspend",
    requiresReason: true,
    reasonLabel: "Suspension reason (required)",
  },
  RESUME: {
    endpoint: "resume",
    confirmTitle: "Resume Work",
    confirmBody: "This will lift the suspension and re-authorize work.",
  },
  CANCEL: {
    endpoint: "cancel",
    requiresReason: true,
    reasonLabel: "Cancellation reason (required)",
    destructive: true,
    confirmTitle: "Cancel Permit",
    confirmBody:
      "Cancellation is permanent and cannot be undone. The permit will be archived.",
  },
  CLOSE: {
    endpoint: "close",
    requiresCompletionNotes: true,
  },
  VERIFY_CLOSURE: {
    endpoint: "verify-closure",
    requiresVerifyNotes: true,
  },
};

// ── Component ─────────────────────────────────────────────────────────────────

export function ActionPanel({ permitId, actions, onActionSuccess }: ActionPanelProps) {
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const [completionNotes, setCompletionNotes] = useState("");
  const [verifyNotes, setVerifyNotes] = useState("");

  // Simple confirm-only actions
  const [confirmAction, setConfirmAction] = useState<string | null>(null);

  if (actions.length === 0) return null;

  function openAction(actionKey: string) {
    const cfg = ACTION_CONFIGS[actionKey];
    if (!cfg) return;

    const needsModal =
      cfg.requiresReason ||
      cfg.requiresComment ||
      cfg.requiresCompletionNotes ||
      cfg.requiresVerifyNotes;

    if (needsModal) {
      setReason("");
      setComment("");
      setCompletionNotes("");
      setVerifyNotes("");
      setError(null);
      setActiveAction(actionKey);
    } else if (cfg.confirmTitle) {
      setConfirmAction(actionKey);
    } else {
      // No confirmation needed (e.g. resume with no destructive risk)
      executeAction(actionKey, {});
    }
  }

  async function executeAction(actionKey: string, body: Record<string, string>) {
    const cfg = ACTION_CONFIGS[actionKey];
    if (!cfg) return;

    setLoading(true);
    setError(null);
    try {
      await api.post(`/api/permits/${permitId}/${cfg.endpoint}`, body);
      setActiveAction(null);
      setConfirmAction(null);
      onActionSuccess();
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : "An unexpected error occurred. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  function handleModalSubmit() {
    if (!activeAction) return;
    const cfg = ACTION_CONFIGS[activeAction];
    if (!cfg) return;

    const body: Record<string, string> = {};

    if (cfg.requiresReason) {
      if (!reason.trim()) {
        setError("A reason is required to perform this action.");
        return;
      }
      body.reason = reason.trim();
    }
    if (cfg.requiresComment && comment.trim()) {
      body.comment = comment.trim();
    }
    if (cfg.requiresCompletionNotes) {
      if (!completionNotes.trim()) {
        setError("Work completion notes are required.");
        return;
      }
      body.workCompletionNotes = completionNotes.trim();
    }
    if (cfg.requiresVerifyNotes) {
      body.closureVerifiedNotes = verifyNotes.trim();
    }

    executeAction(activeAction, body);
  }

  const activeConfig = activeAction ? ACTION_CONFIGS[activeAction] : null;
  const activeActionItem = activeAction
    ? actions.find((a) => a.action === activeAction)
    : null;
  const confirmActionItem = confirmAction
    ? actions.find((a) => a.action === confirmAction)
    : null;
  const confirmCfg = confirmAction ? ACTION_CONFIGS[confirmAction] : null;

  return (
    <>
      {/* Action Buttons Strip */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mr-1">
            Available Actions
          </span>
          {actions.map((action) => {
            const variant =
              ACTION_VARIANTS[action.action] ||
              "bg-zinc-700 hover:bg-zinc-800 text-white";
            const icon = ACTION_ICONS[action.action] || null;
            return (
              <button
                key={action.action}
                id={`action-btn-${action.action.toLowerCase()}`}
                type="button"
                onClick={() => openAction(action.action)}
                disabled={loading}
                title={action.description}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed ${variant}`}
              >
                {loading && activeAction === action.action ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  icon
                )}
                {action.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Modal for actions requiring input */}
      {activeAction && activeConfig && (
        <Modal
          isOpen={true}
          onClose={() => {
            if (!loading) {
              setActiveAction(null);
              setError(null);
            }
          }}
          title={activeActionItem?.label ?? activeAction}
        >
          <div className="space-y-4">
            {activeActionItem?.description && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {activeActionItem.description}
              </p>
            )}

            {activeConfig.requiresReason && (
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  {activeConfig.reasonLabel ?? "Reason (required)"}
                </label>
                <textarea
                  id={`action-reason-${activeAction.toLowerCase()}`}
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={loading}
                  placeholder="Provide a clear justification..."
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-sky-500/60 resize-none disabled:opacity-50"
                />
              </div>
            )}

            {activeConfig.requiresComment && (
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Approval comment (optional)
                </label>
                <textarea
                  id="action-comment"
                  rows={2}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  disabled={loading}
                  placeholder="Any conditions or notes..."
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-sky-500/60 resize-none disabled:opacity-50"
                />
              </div>
            )}

            {activeConfig.requiresCompletionNotes && (
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Work completion notes (required)
                </label>
                <textarea
                  id="action-completion-notes"
                  rows={4}
                  value={completionNotes}
                  onChange={(e) => setCompletionNotes(e.target.value)}
                  disabled={loading}
                  placeholder="Describe all work completed, final site conditions, and any residual hazards..."
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-sky-500/60 resize-none disabled:opacity-50"
                />
              </div>
            )}

            {activeConfig.requiresVerifyNotes && (
              <div>
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Verification notes (optional)
                </label>
                <textarea
                  id="action-verify-notes"
                  rows={3}
                  value={verifyNotes}
                  onChange={(e) => setVerifyNotes(e.target.value)}
                  disabled={loading}
                  placeholder="Site inspection observations and confirmation..."
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-sky-500/60 resize-none disabled:opacity-50"
                />
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-xs text-red-700 dark:text-red-300">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setActiveAction(null);
                  setError(null);
                }}
                disabled={loading}
                className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                id={`action-submit-${activeAction.toLowerCase()}`}
                onClick={handleModalSubmit}
                disabled={loading}
                className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-xs disabled:opacity-50 ${
                  activeConfig.destructive
                    ? "bg-red-600 hover:bg-red-700 text-white"
                    : "bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900"
                }`}
              >
                {loading && <Loader2 size={13} className="animate-spin" />}
                Confirm
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirm dialog for simple confirmation-only actions */}
      {confirmAction && confirmCfg && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setConfirmAction(null)}
          title={confirmCfg.confirmTitle ?? confirmActionItem?.label ?? confirmAction}
          message={confirmCfg.confirmBody ?? "Are you sure you want to perform this action?"}
          confirmLabel="Confirm"
          onConfirm={async () => {
            await executeAction(confirmAction, {});
          }}
        />
      )}
    </>
  );
}
