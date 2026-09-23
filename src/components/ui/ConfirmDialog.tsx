"use client";

import React, { useState } from "react";
import { Modal } from "./Modal";
import { AlertTriangle, Info, CheckCircle } from "lucide-react";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: { reason?: string; comment?: string }) => Promise<void> | void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "primary" | "danger" | "success" | "warning";
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  showCommentInput?: boolean;
  commentLabel?: string;
  commentPlaceholder?: string;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "primary",
  requireReason = false,
  reasonLabel = "Reason / Safety Justification",
  reasonPlaceholder = "Provide detailed reason...",
  showCommentInput = false,
  commentLabel = "Optional Comments",
  commentPlaceholder = "Add any operational notes...",
}: ConfirmDialogProps) {
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClose = () => {
    if (isSubmitting) return;
    setReason("");
    setComment("");
    setError(null);
    onClose();
  };

  const handleConfirm = async () => {
    if (requireReason && !reason.trim()) {
      setError("Please provide a reason before proceeding.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      await onConfirm({
        reason: reason.trim() || undefined,
        comment: (comment.trim() || reason.trim()) || undefined,
      });
      handleClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Action failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getVariantStyles = () => {
    switch (variant) {
      case "danger":
        return {
          btn: "bg-red-600 hover:bg-red-700 text-white focus:ring-red-500",
          icon: <AlertTriangle className="text-red-600 dark:text-red-400 shrink-0" size={24} />,
        };
      case "warning":
        return {
          btn: "bg-amber-600 hover:bg-amber-700 text-white focus:ring-amber-500",
          icon: <AlertTriangle className="text-amber-600 dark:text-amber-400 shrink-0" size={24} />,
        };
      case "success":
        return {
          btn: "bg-emerald-600 hover:bg-emerald-700 text-white focus:ring-emerald-500",
          icon: <CheckCircle className="text-emerald-600 dark:text-emerald-400 shrink-0" size={24} />,
        };
      default:
        return {
          btn: "bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 focus:ring-zinc-500",
          icon: <Info className="text-blue-600 dark:text-blue-400 shrink-0" size={24} />,
        };
    }
  };

  const { btn, icon } = getVariantStyles();

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title}>
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          {icon}
          <div className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-line">
            {message}
          </div>
        </div>

        {requireReason && (
          <div className="space-y-1.5 pt-2">
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300">
              {reasonLabel} <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError(null);
              }}
              placeholder={reasonPlaceholder}
              rows={3}
              className="w-full text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2.5 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-500"
              disabled={isSubmitting}
            />
          </div>
        )}

        {showCommentInput && !requireReason && (
          <div className="space-y-1.5 pt-2">
            <label className="block text-xs font-bold text-zinc-700 dark:text-zinc-300">
              {commentLabel}
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={commentPlaceholder}
              rows={3}
              className="w-full text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2.5 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-500"
              disabled={isSubmitting}
            />
          </div>
        )}

        {error && (
          <div className="p-3 text-xs rounded-lg bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900/50">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting || (requireReason && !reason.trim())}
            className={`px-4 py-2 text-sm font-bold rounded-lg shadow-xs transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 ${btn}`}
          >
            {isSubmitting ? "Processing..." : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
